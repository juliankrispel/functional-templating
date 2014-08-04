module.exports = {
    toType: function(obj) {
        return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    },

    isFunction: function(arg){
        return this.toType(arg) === 'function';
    },

    isString: function(arg){
        return this.toType(arg) === 'string';
    },

    isNode: function(arg){
        return arg instanceof Node;
    }
};
