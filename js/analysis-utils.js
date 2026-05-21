// Pengganti src/utils/analysisUtils.ts (gyro-based classification)
(function () {
  function analyzeRecord(gyroAvg) {
    if (gyroAvg > 2.5) return { level: 4, name: 'High Motion', summary: 'Strong movement detected.', color: 'red' };
    if (gyroAvg > 1.5) return { level: 3, name: 'Active', summary: 'Significant motion present.', color: 'yellow' };
    if (gyroAvg > 0.5) return { level: 2, name: 'Light Motion', summary: 'Minor movement detected.', color: 'yellow' };
    return { level: 1, name: 'Stable', summary: 'Sensor is mostly stable.', color: 'green' };
  }

  function groupHistoryByTimestamp(history) {
    const groups = {};
    history.forEach((item) => {
      const key = item.start_time;
      if (!groups[key]) groups[key] = { gyro: null, time: key };
      if (item.sensor_type === 'gyro') groups[key].gyro = item.avg_value;
    });

    const result = [];
    Object.values(groups).forEach((g) => {
      if (g.gyro !== null) {
        result.push({
          timestamp: g.time,
          formattedTime: new Date(g.time).toLocaleString(),
          items: [{ gyro: g.gyro, analysis: analyzeRecord(g.gyro) }],
        });
      }
    });

    return result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }

  window.analysisUtils = { analyzeRecord, groupHistoryByTimestamp };
})();
