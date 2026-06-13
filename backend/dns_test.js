const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');
dns.setServers(['8.8.8.8', '8.8.4.4']);
dns.resolveSrv('_mongodb._tcp.materialapp.t8wxpqk.mongodb.net', (err, addresses) => {
  if (err) {
    console.error('DNS SRV Resolution Error:', err);
  } else {
    console.log('SRV Records:', addresses);
  }
});
