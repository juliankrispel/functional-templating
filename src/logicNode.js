var u = require('./util');

var loopComposites = function($el, args, data){
    u.each(args, function(val){
        if(u.isFunction(val.render)){
            data = val.render($el, data);
        }else if(u.isFunction(val)){
            data = val($el, data);
        }else if(u.isString(val) && args.text === undefined){
            $el.textContent = val;
        }
    });
    return data;
};

var baseInit = function(){
    return function(elName, args){
        if(elName !== undefined){
            this.elName = elName;
        }
        this.args = args;
        this.isRendered = false;
    };
};

var BaseNode = baseInit();

BaseNode.extend = function(extension){
    var newClass = baseInit();

    u.each(this, function(val, key){
        newClass[key] = val;
    });

    u.each(this.prototype, function(val, key){
        newClass.prototype[key] = val;
    });

    if(extension !== undefined){
        u.each(extension, function(val, key){
            newClass.prototype[key] = val;
        });
    }
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

    render: function($parent, data){
        if(this.isRendered === false){
            this.$parent = $parent;
            this.attach();
        }

        var oldData = data;
        loopComposites(this.$el, this.args, data);
        return oldData;
    }
});

var AttributeNode = BaseNode.extend({
    render: function($parent, data){
        var oldData = data;
        loopComposites($parent, this.args, data);
        return oldData;
    }
});


var HtmlObjectAttributeNode = BaseNode.extend({
    render: function($parent, data){
        var value = loopComposites($parent, this.args, data);
        $parent[this.elName] = value || data;
        return data;
    }
});

module.exports = {
    ElementNode: ElementNode,
    AttributeNode: AttributeNode,
    HtmlObjectAttributeNode: HtmlObjectAttributeNode,
    _loopComposites: loopComposites
};
