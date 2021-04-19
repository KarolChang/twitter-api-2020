const db = require('../models')
const User = db.User
const Tweet = db.Tweet
const Like = db.Like
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const _helpers = require('../_helpers')


const adminController = {
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
      if (user.role !== 'admin') {
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
  // 取得所有使用者資料 (使用者資料、推文數量、推文被 like 的數量、關注人數、跟隨者人數)
  // 清單預設按推文數排序 (未完成)
  getUsers: async (req, res) => {
    try {
      // 找出所有 user
      let users = await User.findAll({
        include: [
          Tweet,
          { model: User, as: 'Followers' },
          { model: User, as: 'Followings' }
        ]
      })
      // 如果沒有 user，回傳 message
      if (users.length === 0) {
        return res.json({ message: 'db has no user!' })
      }
      // 計算 : 推文被 like 的數量
      const tweetsOfUser = await Tweet.findAll({
        where: { UserId: _helpers.getUser(req) }
      })
      const tweetIds = []
      let tweetsLikedCount = 0
      tweetsOfUser.forEach(tweet => tweetIds.push(tweet.id))
      tweetIds.forEach(async (tweetId) => {
        const [rows, count] = await Like.findAndCountAll({ where: tweetIds })
        tweetsLikedCount += count
      })
      // 加入以下資料: 使用者資料、推文數量、推文被 like 的數量、關注人數、跟隨者人數
      users = users.map(u => ({
        ...u.dataValues,
        tweetCount: u.Tweets.length,
        tweetsLikedCount: tweetsLikedCount,
        followingsCount: u.Followings.length,
        followersCount: u.Followers.length
      }))
      return res.json(users)
    } catch (e) {
      console.log(e)
    }
  }
}

module.exports = adminController
