module.exports = {
    toType: function(obj) {
        return ({}).toString.call(obj).match(/\s([a-zA-Z]+)/)[1].toLowerCase();
    },

    error: function(mess){
        throw new Error(mess);
    },

    typeError: function(type){
        this.error('Invalid Argument Error: , should be ' +  type);
    },

    refError: function(msg){
        this.error('Referrence Error: Object has no member of name ' + msg);
    },

    uuid: (function() {
        function s4() {
            return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
        }
        return function() {
            return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
        s4() + '-' + s4() + s4() + s4();
        };
    })(),

    assertClass: function(obj, classObject){
        if(!obj instanceof classObject){
            this.typeError('ElementNode');
        }
    },

    assertType: function(obj, type){
        if(!this.isType(obj, type)){
            this.typeError(type);
        }
    },

    isUndefined: function(obj){
        return obj === undefined;
    },

    isNotUndefined: function(obj){
        return obj !== undefined;
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

    isNumberOrString: function(obj){
        return this.isString(obj) || this.isNumber(obj);
    },

    isArray: function(arg){
        return this.toType(arg) === 'array';
    },

    isNumber: function(arg){
        return this.toType(arg) === 'number';
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
