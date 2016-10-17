plugin-extend 用于在开发一个node cli，支持自定义插件扩展

USAGE

```
    var PE = require('plugin-extend');

    var pe = new PE({
        prefix: 'sphinx-sln'
    });
    var sln = pe.getPlugin('sc:app');
```