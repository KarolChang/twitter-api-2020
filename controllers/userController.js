const db = require('../models')
const User = db.User
const Tweet = db.Tweet
const Reply = db.Reply

const helpers = require('../_helpers')

const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const imgur = require('imgur-node-api')
const IMGUR_CLIENT_ID = process.env.IMGUR_CLIENT_ID

const { Op } = require('sequelize')

const uploadImg = path => {
  return new Promise((resolve, reject) => {
    imgur.upload(path, (err, img) => {
      if (err) return reject(err)
      return resolve(img)
    })
  })
}

const userController = {
  // 登入
  login: async (req, res) => {
    try {
      const { email, password } = req.body
      // check email & password required
      if (!email || !password) {
        return res.json({ status: 'error', message: 'email and password are required!' })
      }
      // check email & password exist
      const user = await User.findOne({ where: { email } })
      if (!user) {
        return res.status(401).json({ status: 'error', message: 'this email has not been registered!' })
      }
      // check user role, must be admin
      if (user.role !== 'user') {
        return res.status(401).json({ status: 'error', message: 'you don\'t have authority to login!' })
      }
      // check password correct or not
      if (!bcrypt.compareSync(password, user.password)) {
        return res.status(401).json({ status: 'error', message: 'password incorrect!' })
      }
      // get token
      const payload = { id: user.id }
      const token = jwt.sign(payload, process.env.JWT_SECRET)
      return res.json({
        status: 'success',
        message: 'ok',
        token: token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      })
    } catch (e) {
      console.log(e)
    }
  },
  // 註冊
  register: async (req, res) => {
    try {
      const { account, name, email, password, confirmPassword } = req.body
      // check account & name & email & password & confirmPassword are required
      if (!account || !name || !email || !password || !confirmPassword) {
        return res.json({ status: 'error', message: 'account, name, email, password, confirmPassword are required!' })
      }
      // check password & confirmPassword are same
      if (password !== confirmPassword) {
        return res.json({ status: 'error', message: 'password & confirmPassword must be same!' })
      }
      // check email & account have not been used
      const userEmail = await User.findOne({ where: { email } })
      if (userEmail) return res.json({ status: 'error', message: 'this email has been used!' })
      const userAccount = await User.findOne({ where: { account } })
      if (userAccount) return res.json({ status: 'error', message: 'this account has been used!' })
      // create user
      await User.create({ account, name, email, password: bcrypt.hashSync(password, bcrypt.genSaltSync(10), null), role: 'user' })
      return res.json({ status: 'success', message: 'register success!' })
    } catch (e) {
      console.log(e)
    }
  },
  // 查看單一 user 資料 (user資料、推文與回覆、跟隨中、跟隨者、喜歡的內容) => 排序依日期，最新的在前
  // bug: 回覆未能照 createdAt 排列
  getUser: async (req, res) => {
    try {
      const user = await User.findByPk(req.params.id, {
        include: [
          { model: Tweet, include: [Reply] },
          { model: Tweet, as: 'LikedTweets' },
          { model: User, as: 'Followings' },
          { model: User, as: 'Followers' }
        ],
        order: [
          [{ model: Tweet }, 'createdAt', 'DESC'],
          [{ model: Tweet, as: 'LikedTweets' }, 'createdAt', 'DESC'],
          [{ model: User, as: 'Followings' }, 'createdAt', 'DESC'],
          [{ model: User, as: 'Followers' }, 'createdAt', 'DESC']
        ]
      })
      if (!user) return res.json({ message: 'can not find this user!' })
      return res.json(user)
    } catch (e) {
      console.log(e)
    }
  },
  // 查看單一使用者發過的推文
  getTweetsOfUser: async (req, res) => {
    try {
      const tweets = await Tweet.findAll({ where: { UserId: req.params.id }, order: [['createdAt', 'DESC']] })
      if (tweets.length === 0) return res.json({ message: 'this user has no tweet or user does not exist!' })
      return res.json(tweets)
    } catch (e) {
      console.log(e)
    }
  },
  // 編輯使用者自己的資料 (name、introduction、avatar、cover)
  putUser: async (req, res) => {
    try {
      // 只能編輯自己的資料
      const userId = helpers.getUser(req).id
      const id = Number(req.params.id)
      if (userId !== id) return res.json({ status: 'error', message: 'can not edit profile of other users!' })
      // 處理圖片
      const { files } = req
      if (files) {
        imgur.setClientID(IMGUR_CLIENT_ID)
        const imgAvatar = await uploadImg(files.avatar[0].path)
        const imgCover = await uploadImg(files.cover[0].path)
        console.log('imgAvatar', imgAvatar)
        console.log('imgCover', imgCover)
        const user = await User.findByPk(userId)
        await user.update({
          name: req.body.name,
          introduction: req.body.introduction,
          avatar: imgAvatar.data.link,
          cover: imgCover.data.link
        })
      } else {
        const user = await User.findByPk(userId)
        user.update({
          name: req.body.name,
          introduction: req.body.introduction,
          avatar: user.avatar ? user.avatar : '',
          cover: user.cover ? user.cover : ''
        })
      }
      return res.json({ status: 'success', message: 'profile edit success!' })
    } catch (e) {
      console.log(e)
    }
  },
  // 查看單一使用者發過回覆的推文
  getRepliedTweetsOfUser: async (req, res) => {
    try {
      const id = Number(req.params.id)
      const replies = await Reply.findAll({ where: { userId: id } })
      const tweetIdArr = []
      replies.forEach(r => {
        if (tweetIdArr.includes(r.TweetId)) return
        tweetIdArr.push(r.TweetId)
      })
      const tweets = await Tweet.findAll({
        where: {
          [Op.or]: Array.from({ length: tweetIdArr.length }).map((_, i) => ({ id: tweetIdArr[i] }))
        },
        include: [Reply]
      })
      if (tweets.length === 0) return res.json({ message: 'this user has no tweet or user does not exist!' })
      return res.json(tweets)
    } catch (e) {
      console.log(e)
    }
  }
}

module.exports = userController
