const mongoose = require('mongoose');
const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/amor_saude';
console.log('Try connect', MONGO);
mongoose.connect(MONGO, { serverSelectionTimeoutMS: 5000 })
  .then(() => mongoose.connection.db.admin().listDatabases())
  .then(d => {
    console.log('DBs:', d.databases.map(x => x.name));
    process.exit(0);
  })
  .catch(e => {
    console.error('ConnErr', e.message || e);
    process.exit(1);
  });
