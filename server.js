var PORT = process.env.OPENSHIFT_INTERNAL_PORT || process.env.OPENSHIFT_NODEJS_PORT  || 8080;
var IPADDRESS = process.env.OPENSHIFT_INTERNAL_IP || process.env.OPENSHIFT_NODEJS_IP || '127.0.0.1';
var express = require('express');
var server;
var io;
var app;
var Handlebars = require('./common/handlebars').Handlebars;
var Message = require('./common/models').Message;
var User = require('./common/models').User;
var argv = require('optimist').argv;
app = express();
app.use(function(req, res, next) {
    var origin = '*';
    try {
        var parts = req.headers.referer.split('/').filter(function(n){return n;});
        if (parts.length >= 2){
            origin = parts[0] + '//' + parts[1];
        }
    } catch (e) {
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    next();
});
app.use('/varSocketURI.js', function(req, res) {
    var port = argv['websocket-port'];
    var socketURI = port ? ':'+port+'/' : '/';
    res.set('Content-Type', 'text/javascript');
    res.send('var socketURI=window.location.hostname+"'+socketURI+'";');
});
app.use('/client', express.static(__dirname + '/client'));
app.use('/common', express.static(__dirname + '/common'));
app.get('/', function(req, res) {
    res.sendfile(__dirname + '/client/index.html');
});
server = require('http').createServer(app);
server.listen(PORT, IPADDRESS);
var users = {
    list: [],
    add: function(user) {
        this.list.push(user);
        io.sockets.emit('user-list', {
            'users': this.list
        });
    },
    remove: function(user) {
        var index = this.list.indexOf(user);
        if (index != -1) {
            this.list.splice(index, 1);
            io.sockets.emit('user-list', {
                'users': this.list
            });
            return true;
        }
        return false;
    }
};
var messages = {
    "welcome": Handlebars.compile('Please enter your name'),
    "invalidRequireName": Handlebars.compile('Name required'),
    "invalidNameChange": Handlebars.compile('Do not change your username.'),
    "leftChatroom": Handlebars.compile("{{name}} has quit."),
    "hasJoinedRoom": Handlebars.compile('{{name}} has joined.'),
    "invalidName": Handlebars.compile('"{{name}}" is invalid. Disconnecting...'),
};
io = require('socket.io').listen(server);
io.configure(function() {
    var logLevel = (argv["log-level"] === undefined) ? 3 : argv["log-level"];
    io.set("log level", logLevel);
});
io.sockets.on('connection', function (socket) {
    var user = User();
    var disconnectSocket = function() {
        var wasUserRemoved = users.remove(user);
        if (user.name && wasUserRemoved) {
            io.sockets.emit('chat', Message(messages.leftChatroom(user)));
        }
        socket.disconnect();
    };
    socket.emit('chat', Message(messages.welcome()));
    socket.once('disconnect', function() {
        disconnectSocket();
    });
    socket.on('set-name', function(data){
        user.name = data.username;
        if (user.isValid()) {
            users.add(user);
            io.sockets.emit('chat', Message(messages.hasJoinedRoom(user)));
        }
        else {
            socket.emit('chat', Message(messages.invalidName(user), User('server'), 'error'));
            disconnectSocket();
        }
    });
    socket.on('chat', function (data) {
        if (data.user && data.user.name == user.name) {
            io.sockets.emit('chat', Message(data.message, user, "chat"));
        }
        else if (!user.name) {
            socket.emit('chat', Message(messages.invalidRequireName(), User('server'), 'error'));
            disconnectSocket();
        }
        else {
            socket.emit('chat', Message(messages.invalidNameChange(), User('server'), 'error'));
            disconnectSocket();
        }
    });
});
