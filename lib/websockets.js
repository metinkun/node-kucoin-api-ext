const WebSocket = require('ws');
const axios = require('axios');

const Sockets = {};
Sockets.ws = [];

getPublicWsToken = async function (baseURL) {
  let endpoint = '/api/v1/bullet-public';
  let url = baseURL + endpoint;
  let result = await axios.post(url, {});
  return result.data;
};

getPrivateWsToken = async function (baseURL, sign) {
  let endpoint = '/api/v1/bullet-private';
  let url = baseURL + endpoint;
  let result = await axios.post(url, {}, sign);
  return result.data;
};

getSocketEndpoint = async function (type, baseURL, environment, sign) {
  let r;
  if (type == 'private') {
    r = await getPrivateWsToken(baseURL, sign);
  } else {
    r = await getPublicWsToken(baseURL);
  }
  let token = r.data.token;
  let instanceServer = r.data.instanceServers[0];

  if (instanceServer) {
    if (environment === 'sandbox') {
      return `${instanceServer.endpoint}?token=${token}&[connectId=${Date.now()}]`;
    } else if (environment === 'live') {
      return `${instanceServer.endpoint}?token=${token}&[connectId=${Date.now()}]`;
    }
  } else {
    throw Error('No Kucoin WS servers running');
  }
};


Sockets.clearSockets = function () {
  Sockets.ws.forEach((ws) => {
    try {
      clearInterval(ws.heartbeat);
      ws.close();
    } catch (error) {}
  });
  Sockets.ws = [];
}

/*  
  Initiate a websocket
  params = {
    topic: enum 
    symbols: array [optional depending on topic]
  }
  eventHanlder = function
*/
Sockets.initSocket = async function (params, eventHandler) {
  try {
    if (!params.sign) params.sign = false;
    if (!params.endpoint) params.endpoint = false;
    let [topic, endpoint, type] = Sockets.topics(params.topic, params.symbols, params.endpoint, params.sign);
    let sign = this.sign('/api/v1/bullet-private', {}, 'POST');
    let websocket, ws;
    const index = Sockets.ws.length;
    const connect = async () => {
      console.log('socket connecting');
      websocket = await getSocketEndpoint(type, this.baseURL, this.environment, sign);
      ws = new WebSocket(websocket);

      if (!Sockets.ws[index]) Sockets.ws.push(ws);
      else {
        try {
          clearInterval(Sockets.ws[index].heartbeat);
          Sockets.ws[index].close();
        } catch (error) {}
        Sockets.ws[index] = ws;
      }
      Sockets.ws[index].index = index;
      ws.on('open', () => {
        console.log(topic + ' opening websocket connection... ');
        Sockets.subscribe(index, endpoint, type, eventHandler);
        Sockets.ws[index].connected = true;
        Sockets.ws[index].heartbeat = setInterval(Sockets.socketHeartBeat, 20000, index);
      });
      ws.on('error', (error) => {
        Sockets.handleSocketError(error);
        console.log(error);
      });
      ws.on('ping', () => {
        return;
      });
      ws.on('close', () => {
        Sockets.ws[index].connected = false;
        clearInterval(Sockets.ws[index].heartbeat);
        console.log(topic + ' websocket closed... reconnecting');
      });
    };
    await connect();
    setInterval(async () => {
      if (!Sockets.ws[index].connected) {
        await connect();
      }
    }, 10000);
  } catch (err) {
    console.log(err);
  }
};

Sockets.handleSocketError = function (error) {
  console.log('WebSocket error: ' + (error.code ? ' (' + error.code + ')' : '') + (error.message ? ' ' + error.message : ''));
};

Sockets.socketHeartBeat = function (index) {
  let ws = Sockets.ws[index];
  ws.ping();
};

Sockets.subscribe = async function (index, endpoint, type, eventHandler) {
  let ws = Sockets.ws[index];
  if (type === 'private') {
    ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: endpoint,
        privateChannel: true,
        response: true,
      })
    );
  } else {
    ws.send(
      JSON.stringify({
        id: Date.now(),
        type: 'subscribe',
        topic: endpoint,
        response: true,
      })
    );
  }
  ws.on('message', eventHandler);
};

Sockets.unsubscribe = async function (index, endpoint, type, eventHandler) {
  let ws = Sockets.ws[index];
  ws.send(
    JSON.stringify({
      id: Date.now(),
      type: 'unsubscribe',
      topic: endpoint,
      response: true,
    })
  );
  ws.on('message', eventHandler);
};

Sockets.topics = function (topic, symbols = [], endpoint = false, sign = false) {
  if (endpoint) return [topic, endpoint + (symbols.length > 0 ? ':' : '') + symbols.join(','), sign ? 'private' : 'public'];
  if (topic === 'ticker') {
    return [topic, '/market/ticker:' + symbols.join(','), 'public'];
  } else if (topic === 'allTicker') {
    return [topic, '/market/ticker:all', 'public'];
  } else if (topic === 'symbolSnapshot') {
    return [topic, '/market/snapshot:' + symbols[0], 'public'];
  } else if (topic === 'marketSnapshot') {
    return [topic, '/market/snapshot:' + symbols[0], 'public'];
  } else if (topic === 'orderbook') {
    return [topic, '/market/level2:' + symbols.join(','), 'public'];
  } else if (topic === 'match') {
    return [topic, '/market/match:' + symbols.join(','), 'public'];
  } else if (topic === 'fullMatch') {
    return [topic, '/spotMarket/level3:' + symbols.join(','), 'public'];
  } else if (topic === 'orders') {
    return [topic, '/spotMarket/tradeOrders' + symbols.join(','), 'private'];
  } else if (topic === 'balances') {
    return [topic, '/account/balance', 'private'];
  } else if (topic === 'depth50') {
    return [topic, '/spotMarket/level2Depth50:' + symbols.join(','), 'public'];
  } else if (topic === 'depth5') {
    return [topic, '/spotMarket/level2Depth5:' + symbols.join(','), 'public'];
  }
};

module.exports = Sockets;
