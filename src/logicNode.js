var u = require('./util');
window.u = u;
var Immutable = require('immutable');

var loopComposites = function($el, args, data){
    u.each(args, function(val){
        if(u.isFunction(val.execute)){
            data = val.execute($el, data);
        }else if(u.isFunction(val)){
            data = val($el, data);
        }
    });
    return data;
};

var baseInit = function(){
    return function(elName, args){
        if(elName !== undefined){
            this.elName = elName;
        }

        if(u.isString(args.first())){
            this.hardData = args.first();
            this.args = args.skip(1);
        }else{
            this.args = args;
        }

        this.isRendered = false;
    };
};

var BaseNode = baseInit();
BaseNode.prototype.constructor = BaseNode;

BaseNode.extend = function(extension){
    return extendClass(this, extension);
};

BaseNode.prototype.copy = function(){
    return new this.constructor(this.elName, this.args);
};

var extendClass = function(base, extension){
    var newClass = baseInit();

    u.each(base, function(val, key){
        newClass[key] = val;
    });

    u.each(base.prototype, function(val, key){
        newClass.prototype[key] = val;
    });

    if(extension !== undefined){
        u.each(extension, function(val, key){
            newClass.prototype[key] = val;
        });
    }
    newClass.prototype.constructor = newClass;
    return newClass;
};

var ElementNode = BaseNode.extend({
    attach: function(){
        this.$el = document.createElement(this.elName);
        this.isRendered = true;
        this.$parent.appendChild(this.$el);
    },

    detach: function(){
        this.$el.remove();
        this.isRendered = false;
    },

    execute: function($parent, data){
        if(! data instanceof Immutable.constructor){
            data = Immutable.fromJS(data);
        }

        if(this.isRendered === false){
            this.$parent = $parent;
            this.attach();
        }

        var oldData = data;
        loopComposites(this.$el, this.args, data);
        this.data = data;
        return oldData;
    }
});

var AttributeNode = BaseNode.extend({
    execute: function($parent, data){
        var oldData = data;
        var value = loopComposites($parent, this.args, data);
        this.data = data;
        $parent.setAttribute(this.elName, this.hardData || value || data);
        return oldData;
    }
});


var HtmlObjectAttributeNode = BaseNode.extend({
    execute: function($parent, data){
        var value = loopComposites($parent, this.args, data);
        $parent[this.elName] = this.hardData || value || data;
        return data;
    }
});

module.exports = {
    ElementNode: ElementNode,
    AttributeNode: AttributeNode,
    HtmlObjectAttributeNode: HtmlObjectAttributeNode,
    _loopComposites: loopComposites
};
