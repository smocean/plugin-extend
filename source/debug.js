'use strict';

var resolver = new (require('./index.js'))({
    prefix: 'generator'
});

resolver.getPlugin('smsc');
