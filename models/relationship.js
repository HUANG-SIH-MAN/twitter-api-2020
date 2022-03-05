'use strict'
module.exports = (sequelize, DataTypes) => {
  const Relationship = sequelize.define('Relationship', {
    sendUserId: DataTypes.INTEGER,
    listenUserId: DataTypes.INTEGER
  }, {})
  Relationship.associate = function (models) {
    Relationship.belongsTo(models.User, { foreignKey: 'sendUserId' })
    Relationship.belongsTo(models.User, { foreignKey: 'listenUserId' })
  }
  return Relationship
}
