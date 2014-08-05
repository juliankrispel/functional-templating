var Immutable = require('immutable');
var u = require('./util');
var multimethod = require('multimethod');

var ElementNode = require('./logicNode').ElementNode;
var AttributeNode = require('./logicNode').AttributeNode;
var HtmlObjectAttributeNode = require('./logicNode').HtmlObjectAttributeNode;
var loopComposites = require('./logicNode')._loopComposites;

var obj = {};



var htmlElements = ['h1','h2','h3','h4','h5','h6','p','a','body','main','div','data','address','section','nav','article','aside','pre','hr','blockquote','ol','ul','li','dl','dt','dd','figure','figcaption','em','strong','small','s','cite','q','dfn','abbr','time','code','var','samp','kbd','sub','sup','i','b','u','mark','bdo','span','br','ins','del','img','iframe','embed','object','param','video','audio','source','track','canvas','map','area','svg','math','table','thead','th','tbody','tr','td','tfoot','colgroup','caption','col','form','fieldset','legend','label','input','button','select','datalist','optgroup','option','textarea','keygen','output','progress','meter','script','template','noscript','head','title','base','link','meta','style'];

var htmlAttributes = ['id','href','alt','rel','action','width','height','class','max','maxlength','min','readonly','autocomplete','disabled','name','rowspan','src','title'];

var htmlObjectAttributes = ['textContent', 'innerHTML'];

var obj = {
    filterData: function(accessor){
        var path = accessor.split('.');
        return function($parent, data){
            var dataCache = data;
            u.each(path, function(val){
                dataCache = dataCache[val];
            });
            return dataCache;
        };
    },

    each: function(){
        var args = arguments;
        return function($parent, data){
            console.log($parent, data, args);
            u.assertType(data, 'array');
            u.each(data, function(val){
                loopComposites($parent, args, val);
            });
            return data;
        };
    },
};

var generate = function(classObject, name){
    return function(){ return new classObject(name, arguments); };
};

u.each(htmlElements, function(val){
    obj[val] = generate(ElementNode, val);
});

u.each(htmlAttributes, function(val){
    obj[val] = generate(AttributeNode, val);
});

u.each(htmlObjectAttributes, function(val){
    obj[val] = generate(HtmlObjectAttributeNode, val);
});

var _elGenerator = function(elName){
    return function(){
        return new ElementNode(elName, arguments);
    };
};

var _setAttribute = function(attrName){
    return function(){
        return new AttributeNode(attrName);
    };
};

var _setObjectAttribute = function(attrName){
    return function(){
        return new AttributeNode(attrName);
    };
};



module.exports = obj;

//module.exports = {
//    div: function(){
//
//        var el = document.createElement('div');
//        var data;
//        var funcs = [];
//
//        for(var i = 0; i < arguments.length; i++){
//            var arg = arguments[i];
//            if(!u.isFunction(arg) && data === undefined){
//                data = arg;
//            }else{
//                funcs.push(arg);
//            }
//        }
//
//
//        return function(){
//            for(var i = 0; i < arguments.length; i++){
//                var arg = arguments[i];
//                if(arg instanceof Node){
//                    arg.appendChild(el);
//                }
//            }
//            for(var i = 0; i < funcs.length; i++){
//                funcs[i]()
//            }
//        };
//    }
//};
