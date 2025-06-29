const getDateFilter = (startDate, endDate) => {
  if (!startDate || !endDate) return {};
  return {
    createdAt: {
      gte: new Date(startDate),
      lte: new Date(new Date(endDate).setHours(23, 59, 59, 999)),
    },
  };
};

module.exports = getDateFilter;
