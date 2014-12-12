var Immutable = require('immutable');
var u = require('./util');
var Model = require('./model');
var multimethod = require('multimethod');

var ElementNode = require('./logicNode').ElementNode;
var AttributeNode = require('./logicNode').AttributeNode;
var HtmlObjectAttributeNode = require('./logicNode').HtmlObjectAttributeNode;
var loopComposites = require('./logicNode')._loopComposites;

var obj = {};

window.i = Immutable;

var htmlElements = ['h1','h2','h3','h4','h5','h6','p','a','body','main','div','data','address','section','nav','article','aside','pre','hr','blockquote','ol','ul','li','dl','dt','dd','figure','figcaption','em','strong','small','s','cite','q','dfn','abbr','time','code','var','samp','kbd','sub','sup','i','b','u','mark','bdo','span','br','ins','del','img','iframe','embed','object','param','video','audio','source','track','canvas','map','area','svg','math','table','thead','th','tbody','tr','td','tfoot','colgroup','caption','col','form','fieldset','legend','label','input','button','select','datalist','optgroup','option','textarea','keygen','output','progress','meter','script','template','noscript','head','title','base','link','meta','style'];

var htmlAttributes = ['href','alt','rel','action','width','height','class','max','maxlength','min','readonly','autocomplete','disabled','name','rowspan','src','title'];

var htmlObjectAttributes = ['id', 'textContent', 'innerHTML'];

var obj = {
    get: function(accessor){
        var path = accessor.split('.');
        return function($parent, data){
            var dataCache = data;
            if(data instanceof Immutable.constructor){
                dataCache = dataCache.getIn(path);
            }else{
                u.each(path, function(val){
                    dataCache = dataCache[val];
                });
            }
            return dataCache;
        };
    },

    each: function(elNode){
        u.assertClass(elNode, ElementNode);
        var childNodes;

        return function($parent, data){
            childNodes = data.map(function(o){
                var node = elNode.copy();
                node.data = o;
                return node;
            });

            childNodes.forEach(function(node){
                node.execute($parent, node.data);
            });

            //
//            u.each(data, function(val){
//                loopComposites($parent, args, val);
//            });
            return data;
        };
    },
};

var generate = function(classObject, name){
    return function(){ return new classObject(name, Immutable.fromJS(arguments)); };
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

module.exports = obj;
