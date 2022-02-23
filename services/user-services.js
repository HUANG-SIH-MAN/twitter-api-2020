const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { Op } = require('sequelize')

const { User, Followship, Tweet, Reply, Like } = require('../models')
const { getUser } = require('../_helpers')
const userServices = {
  postUser: (req, cb) => {
    return User.findOne({
      where: {
        [Op.or]: [
          { email: req.body.email },
          { account: req.body.account }
        ]
      },
      raw: true,
      nest: true
    })
      .then(user => {
        if (user) {
          if (user.email === req.body.email) {
            throw new Error('信箱已被註冊過')
          } else {
            throw new Error('帳號已被註冊過')
          }
        }
        return bcrypt.hash(req.body.password, 10)
      })
      .then(hash => User.create({
        name: req.body.name,
        account: req.body.account,
        email: req.body.email,
        password: hash
      }))
      .then(user => {
        delete user.dataValues.password
        return cb(null, { user })
      })
      .catch(err => cb(err))
  },
  userLogin: (req, cb) => {
    const userData = getUser(req).toJSON()
    try {
      const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '30d' })
      return cb(null, { token })
    } catch (err) {
      cb(err)
    }
  },
  getUserProfile: (req, cb) => {
    const { id } = req.params
    return Promise.all([
      User.findByPk(id, {
        raw: true,
        nest: true
      }),
      Followship.findAll({
        where: { followerId: id },
        raw: true,
        nest: true
      }),
      Followship.findAll({
        where: { followingId: id },
        raw: true,
        nest: true
      })
    ])
      .then(([user, follower, following]) => {
        if (!user) throw new Error('資料庫內沒有相關資料')
        const data = {
          id: user.id,
          email: user.email,
          account: user.account,
          name: user.name,
          cover: user.cover,
          avatar: user.avatar,
          introduction: user.introduction,
          follower: follower.length,
          following: following.length
        }
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  getUserTweet: (req, cb) => {
    const { id } = req.params
    return Promise.all([
      Tweet.findAll({
        where: { userId: id },
        include: [Reply, Like],
        order: [['createdAt', 'DESC']]
      }),
      User.findByPk(id, {
        raw: true,
        nest: true
      })
    ])
      .then(([tweets, user]) => {
        if (!tweets) throw new Error('資料庫內沒有相關資料')
        const data = tweets.map(t => ({
          id: t.dataValues.id,
          userData: {
            id: user.id,
            account: user.account,
            name: user.name,
            avatar: user.avatar
          },
          description: t.dataValues.description,
          replyAmount: t.Replies.length,
          likeAmount: t.Likes.length,
          createdAt: t.dataValues.createdAt
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  getUserReply: (req, cb) => {
    return Reply.findAll({
      where: { userId: req.params.id },
      include: [
        { model: User },
        { model: Tweet, include: User }
      ],
      order: [['createdAt', 'DESC']],
      raw: true,
      nest: true
    })
      .then(replies => {
        if (!replies.length) throw new Error('資料庫內沒有相關資料')
        const data = replies.map(r => ({
          id: r.id,
          comment: r.comment,
          replierData: {
            id: r.User.id,
            account: r.User.account,
            name: r.User.name,
            avatar: r.User.avatar
          },
          tweetId: r.tweetId,
          tweetOwnerId: r.Tweet.userId,
          tweetOwnerAccount: r.Tweet.User.account,
          createdAt: r.createdAt
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  }
}

module.exports = userServices
