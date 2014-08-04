var Immutable = require('immutable');
var u = require('./util');
var multimethod = require('multimethod');

window.u = u;

//This is how it should work



var _elGenerator = function(elName){
    return function(){
        var args = arguments;
        var self = this;
        var data;

        for(var i = 0; i < arguments; i++){
            if(arguments[i] instanceof Immutable.constructor){
                data = arguments[i];
            }
        }

        return function($parent){
            if(self.$el === undefined){
                self.$el = document.createElement(elName);
                $parent.appendChild(self.$el);
            }

            for(var i = 0; i < args.length; i++){
                if(u.isFunction(args[i])){
                    args[i](self.$el);
                }else if(u.isString(args[i]) && args.text === undefined){
                    self.$el.textContent += args[i];
                }
            }

        };
    };
};

var obj = {};
var htmlElements = ['h1','h2','h3','h4','h5','h6','p','a','body','main','div','address','section','nav','article','aside','pre','hr','blockquote','ol','ul','li','dl','dt','dd','figure','figcaption','em','strong','small','s','cite','q','dfn','abbr','data','time','code','var','samp','kbd','sub','sup','i','b','u','mark','bdo','span','br','ins','del','img','iframe','embed','object','param','video','audio','source','track','canvas','map','area','svg','math','table','thead','th','tbody','tr','td','tfoot','colgroup','caption','col','form','fieldset','legend','label','input','button','select','datalist','optgroup','option','textarea','keygen','output','progress','meter','script','template','noscript','head','title','base','link','meta','style'];

var htmlAttributes = [''];


var obj = {
    each: function(data, fn){
        //data.forEach(function)
    }
};
for(var i = 0; i < htmlElements.length; i++){
    obj[htmlElements[i]] = _elGenerator(htmlElements[i]);
}

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
