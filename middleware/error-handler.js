module.exports = {
  apiErrorHandler (err, req, res, next) {
    if (err instanceof Error) {
      if (err.message === '帳號不存在') {
        return res.status(200).json({
          status: 'error',
          statusCode: '404',
          message: `${err.message}`
        })
      }
      res.status(200).json({
        status: 'error',
        statusCode: '400',
        message: `${err.message}`
      })
    } else if (err instanceof RangeError) {
      res.status(200).json({
        status: 'error',
        statusCode: '400',
        message: `${err.message}`
      })
    } else {
      res.status(200).json({
        status: 'error',
        statusCode: '400',
        message: `${err}`
      })
    }
    next(err)
  }
}
