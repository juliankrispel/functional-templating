var ids = document.querySelectorAll('[id]');
var u = require('./util');
var selectors = {};

u.each(ids, function(el){
    selectors[el.id] = el;
});

module.exports = selectors;
