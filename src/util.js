module.exports = {
    toType: function(obj) {
        return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    },

    error: function(mess){
        throw new Error(mess);
    },

    typeError: function(type){
        this.error('Invalid Argument Type, should be ' +  type);
    },

    assertType: function(obj, type){
        if(!this.isType(obj, type)){
            this.typeError(type);
        }
    },

    assertNotUndefined: function(obj){
        if(obj === undefined){
            this.error('Invalid Argument Type, cannot be undefined');
        }
    },

    isType: function(obj, string){
        return this.toType(obj) === string;
    },

    isFunction: function(arg){
        return this.toType(arg) === 'function';
    },

    isString: function(arg){
        return this.toType(arg) === 'string';
    },

    isNode: function(arg){
        return arg instanceof Node;
    },

    each: function(obj, func){
        this.assertType(func, 'function');
        this.assertNotUndefined(obj);

        if(obj.forEach){
            obj.forEach(func);
        }else if(this.isType(obj, 'array')){
            for(var i = 0; i < obj.length; i++){
                func(obj[i], i);
            }
        }else{
            for(var key in obj){
                func(obj[key], key);
            }
        }
    }
};
