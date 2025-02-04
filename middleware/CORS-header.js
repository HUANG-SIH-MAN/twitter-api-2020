const CORSHeader = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.front_end_web_url)
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  if (req.method === 'OPTIONS') {
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, PUT, PATCH, POST, DELETE, OPTIONS')
  }
  return next()
}

module.exports = {
  CORSHeader
}
