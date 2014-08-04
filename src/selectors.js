var ids = document.querySelectorAll('[id]');
var selectors = {};
for( var i = 0; i < ids.length; i++ ){
    selectors[ids[i].id] = ids[i];
}

module.exports = selectors;
