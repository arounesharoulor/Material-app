const dns = require('dns');
const hosts = [
  'materialapp-shard-00-00.t8wxpqk.mongodb.net',
  'materialapp-shard-00-01.t8wxpqk.mongodb.net',
  'materialapp-shard-00-02.t8wxpqk.mongodb.net'
];

hosts.forEach(host => {
  dns.resolve4(host, (err, addresses) => {
    if (err) {
      console.error(`Error resolving ${host}:`, err.message);
    } else {
      console.log(`${host} resolved to:`, addresses);
    }
  });
});
