const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const { Op } = require('sequelize')
const sequelize = require('sequelize')
const { User, Followship, Tweet, Reply, Like } = require('../models')
const { getUser } = require('../_helpers')
const { imgurFileHandler, localFileHandler } = require('../file-helper')

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
        password: hash,
        role: 'user'
      }))
      .then(user => {
        delete user.dataValues.password
        return cb(null, {
          status: 'success',
          message: '註冊成功',
          user
        })
      })
      .catch(err => cb(err))
  },
  userLogin: (req, cb) => {
    return User.findByPk(getUser(req).toJSON().id, {
      raw: true,
      nest: true,
      attributes: {
        include: [
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Followships WHERE Followships.followingId = User.id)'), 'follower'],
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Followships WHERE Followships.followerId = User.id)'), 'following'],
          [sequelize.literal('(SELECT COUNT(id) FROM Tweets WHERE Tweets.UserId = User.id)'), 'tweetAmount']
        ],
        exclude: ['password', 'createdAt', 'updatedAt']
      }
    })
      .then(userData => {
        const token = jwt.sign(userData, process.env.JWT_SECRET, { expiresIn: '30d' })
        return cb(null, {
          status: 'success',
          message: '成功登入',
          token,
          userData
        })
      })
      .catch(err => cb(err))
  },
  getUserProfile: (req, cb) => {
    // 查看特定使用者與查看當前登入的使用者都是用這隻程式碼，查看特定使用者會在路由處帶 id
    const id = req.params.id || getUser(req).dataValues.id
    return Promise.all([
      User.findByPk(id, {
        raw: true,
        nest: true,
        attributes: {
          include: [
            [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Followships WHERE Followships.followingId = User.id)'), 'follower'],
            [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Followships WHERE Followships.followerId = User.id)'), 'following'],
            [sequelize.literal('(SELECT COUNT(id) FROM Tweets WHERE Tweets.UserId = User.id)'), 'tweetAmount']
          ],
          exclude: ['password', 'createdAt', 'updatedAt']
        }
      }),
      Followship.findAll({
        where: { followerId: getUser(req).dataValues.id },
        raw: true,
        nest: true
      })
    ])
      .then(([user, currentUserFollowing]) => {
        // 如果是從get users/:id 路由進來，需要多回傳當前使用者是否有追蹤特定使用者
        if (req.params.id) user.followed = currentUserFollowing.some(f => f.followingId === user.id)
        return cb(null, user)
      })
      .catch(err => cb(err))
  },
  getUserTweet: (req, cb) => {
    const { id } = req.params
    return Promise.all([
      Tweet.findAll({
        where: { userId: id },
        order: [['createdAt', 'DESC']],
        attributes: ['id', 'description', 'createdAt',
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Likes WHERE Likes.TweetId = Tweet.id)'), 'likeAmount'],
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Replies WHERE Replies.TweetId = Tweet.id)'),
            'replyAmount'],
          [sequelize.literal(`EXISTS (SELECT 1 FROM Likes WHERE userId = ${getUser(req).dataValues.id} AND TweetId = Tweet.id)`), 'userLiked']
        ],
        raw: true,
        nest: true
      }),
      User.findByPk(id, {
        raw: true,
        nest: true
      })
    ])
      .then(([tweets, user]) => {
        if (!tweets.length) return cb(null, [])
        const data = tweets.map(t => ({
          id: t.id,
          userData: {
            id: user.id,
            account: user.account,
            name: user.name,
            avatar: user.avatar
          },
          description: t.description,
          replyAmount: t.replyAmount,
          likeAmount: t.likeAmount,
          userLiked: Boolean(t.userLiked),
          createdAt: t.createdAt
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  getUserReply: (req, cb) => {
    return Reply.findAll({
      where: { userId: req.params.id },
      include: [
        { model: User, attributes: ['id', 'account', 'name', 'avatar'] },
        { model: Tweet, attributes: [] }
      ],
      attributes: {
        include: [
          [sequelize.literal('(SELECT id FROM Users WHERE Users.id = Tweet.UserId)'), 'tweetOwnerId'],
          [sequelize.literal('(SELECT account FROM Users WHERE Users.id = Tweet.UserId)'), 'tweetOwnerAccount']
        ]
      },
      order: [['createdAt', 'DESC']],
      raw: true,
      nest: true
    })
      .then(replies => {
        if (!replies.length) return cb(null, [])
        const data = replies.map(r => ({
          id: r.id,
          comment: r.comment,
          replyerData: {
            id: r.User.id,
            account: r.User.account,
            name: r.User.name,
            avatar: r.User.avatar
          },
          tweetId: r.tweetId,
          tweetOwnerId: r.tweetOwnerId,
          tweetOwnerAccount: r.tweetOwnerAccount,
          createdAt: r.createdAt
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  getUserFollowing: (req, cb) => {
    return Promise.all([
      User.findByPk(req.params.id, {
        include: { model: User, as: 'Followings' }
      }),
      Followship.findAll({
        where: { followerId: getUser(req).dataValues.id },
        raw: true
      })
    ])
      .then(([user, following]) => {
        if (!user.Followings.length) return cb(null, [])

        const currentUserFollowing = following.map(f => f.followingId)
        const data = user.Followings.map(f => ({
          followingId: f.id,
          account: f.account,
          name: f.name,
          avatar: f.avatar,
          introduction: f.introduction,
          followed: currentUserFollowing.some(id => id === f.id)
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  getUserFollower: (req, cb) => {
    return Promise.all([
      User.findByPk(req.params.id, {
        include: { model: User, as: 'Followers' }
      }),
      Followship.findAll({
        where: { followerId: getUser(req).dataValues.id },
        raw: true
      })
    ])
      .then(([user, following]) => {
        if (!user.Followers.length) return cb(null, [])

        const currentUserFollowing = following.map(f => f.followingId)
        const data = user.Followers.map(f => ({
          followerId: f.id,
          account: f.account,
          name: f.name,
          avatar: f.avatar,
          introduction: f.introduction,
          followed: currentUserFollowing.some(id => id === f.id)
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  getUserLike: (req, cb) => {
    const { id } = req.params
    return Like.findAll({
      where: { userId: id },
      include: {
        model: Tweet,
        include: [
          { model: Like, attributes: [] },
          { model: Reply, attributes: [] },
          { model: User }
        ],
        attributes: ['id', 'description', 'createdAt',
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Likes WHERE Likes.TweetId = Tweet.id)'), 'likeAmount'],
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Replies WHERE Replies.TweetId = Tweet.id)'),
            'replyAmount'],
          [sequelize.literal(`EXISTS (SELECT 1 FROM Likes WHERE userId = ${getUser(req).dataValues.id} AND TweetId = Tweet.id)`), 'userLiked']
        ]
      },
      group: ['id'],
      order: [['createdAt', 'DESC']],
      raw: true,
      nest: true
    })
      .then(likes => {
        if (!likes.length) return cb(null, [])
        const data = likes.map(l => ({
          TweetId: l.Tweet.id,
          userData: {
            id: l.Tweet.User.id,
            account: l.Tweet.User.account,
            name: l.Tweet.User.name,
            avatar: l.Tweet.User.avatar
          },
          description: l.Tweet.description,
          replyAmount: l.Tweet.replyAmount,
          likeAmount: l.Tweet.likeAmount,
          userLiked: Boolean(l.Tweet.userLiked),
          createdAt: l.Tweet.createdAt,
          relationshipCreatedAt: l.createdAt
        }))
        return cb(null, data)
      })
      .catch(err => cb(err))
  },
  putUserProfile: (req, cb) => {
    const fileHandler = process.env.NODE_ENV !== 'production' ? localFileHandler : imgurFileHandler
    return User.findByPk(req.params.id)
      .then(user => {
        const { files } = req
        const introduction = req.body.introduction.replace(/\r\n|\n/g, ' ')
        // 有上傳封面或頭像
        if (JSON.stringify(files) !== '{}' && files !== undefined) {
          return Promise.all([
            fileHandler(files.cover),
            fileHandler(files.avatar)
          ])
            .then(([coverFilePath, avatarFilePath]) => {
              return user.update({
                name: req.body.name !== undefined ? req.body.name : user.toJSON().name,
                introduction: introduction !== undefined ? introduction : user.toJSON().introduction,
                cover: coverFilePath || user.toJSON().cover,
                avatar: avatarFilePath || user.toJSON().avatar
              })
            })
        } else {
          return user.update({
            name: req.body.name !== undefined ? req.body.name : user.toJSON().name,
            introduction: introduction !== undefined ? introduction : user.toJSON().introduction
          })
        }
      })
      .then(updatedUser => {
        delete updatedUser.dataValues.password
        cb(null, {
          status: 'success',
          message: '操作成功',
          updatedUser
        })
      })
      .catch(err => cb(err))
  },
  putUserAccount: (req, cb) => {
    return User.findAll({
      where: {
        [Op.or]: [
          { email: req.body.email },
          { account: req.body.account }
        ]
      },
      attributes: ['account', 'email', 'id'],
      raw: true,
      nest: true
    })
      .then(user => {
        // 檢查信箱是否已被用過，如果被用過但 id 等於 getUser 的 id 就代表那是自己
        if (user.some(u => u.email === req.body.email && u.id !== getUser(req).dataValues.id)) throw new Error('信箱已被註冊過')
        if (user.some(u => u.account === req.body.account && u.id !== getUser(req).dataValues.id)) throw new Error('帳號已被註冊過')
        return User.findByPk(req.params.id)
      })
      .then(user => {
        return user.update({
          name: req.body.name !== undefined ? req.body.name : user.name,
          account: req.body.account,
          email: req.body.email,
          password: bcrypt.hashSync(req.body.password, 10)
        })
      })
      .then(updatedUser => {
        delete updatedUser.dataValues.password
        cb(null, {
          status: 'success',
          message: '操作成功',
          updatedUser
        })
      })
      .catch(err => cb(err))
  }
}

module.exports = userServices
