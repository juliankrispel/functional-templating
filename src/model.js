var u = require('./util');
var Immutable = require('immutable');
window.u = u;

window.i = Immutable;

var Model = function(obj){
    this._state = Immutable.fromJS(obj);
    this._notificationQueue = [];
    this._subscribers = {};
};

Model.prototype.subscribe = function(){
};

var diffModel = function(model){
};


var keyValue = function(val, key){
    return val;
};

var oldObject = Immutable.fromJS({a: 1, b: 2, c: 3});
var newObject = Immutable.fromJS({a: 2, b: 2, d: 4});

var diffObjects = function(oldObject, newObject, path){
    oldObject.forEach(function(oldVal, oldKey){
        // Are all values of oldObject contained within newObject?
        // If not then we'll need to issue a remove notification
        // Here We need to differentiate between object and array

        // If we encounter an array-like structure like Vector or sequence,
        // we assume that if the value is still contained, but the key
        // doesn't exist on the object, it has moved
        if(newObject instanceof Immutable.Vector &&
            !newObject.has(oldKey) &&
            newObject.contains(oldValue)){
            console.log('moved index');

        // On the other hand, if the key doesn't exist on the object 
        // and we're encountering a Map as newObject, we assume that
        // it has been deleted.
        }else if(newObject instanceof Immutable.Map &&
            !newObject.has(oldKey)){
            console.log('removed', ', key -> ', oldKey, ', val -> ', oldVal);

        // Something updated in newObject??
        }else if(newObject.has(oldKey) && !newObject.contains(oldVal)){
            if(u.isNumberOrString(oldVal) || u.isNumberOrString(newObject.get(oldKey))){
                console.log('update', ', key -> ', oldKey, ', to val -> ', newObject.get(oldKey));
            }
        }
    });

    newObject.forEach(function(oldVal, oldKey){
        //Check if a property has been added
        if(!oldObject.has(oldKey)){

        }
    });
};

diffObjects(oldObject, newObject);
console.log(oldObject.toJS(), newObject.toJS());

Model.prototype.update = function(ref, func){
    this.oldState = this._state;
    var self = this;

    // Throw error when user is trying to use update like set
    if(u.isString(ref) && !this.oldState.has(ref)){
        u.refError(ref);
    }

    // If an object gets passed create a function that returns 
    // the object for the updateIn callback
    if(!u.isFunction(func)){
        var obj = func;

        if(!u.isString(obj) && !u.isNumber(obj)){
            obj = Immutable.fromJS(obj);
        }

        func = function(){
            return obj;
        };
    }

    this._state = this.oldState.updateIn(ref, func);
    this.notify(ref, 'update');
    return this;
};

Model.prototype.set = function(ref, obj){
    if(this._state.has(ref) || u.isArray(ref)){
        return this.update(ref, obj);
    }
    this._oldState = this._state;
    this._state = this._state.set(ref, obj);
    this.notify(ref, 'create');
};

Model.prototype.delete = function(ref){
    if(u.isArray(ref) && ref.length  === 1){
        ref = ref[0];
    }

    if(u.isString(ref)){
        this._oldSatate = this._state;
        this._state = this._state.delete(ref);
        this.notify(ref, 'delete');

    }else if (u.isArray(ref)){
        this._oldState = this._state;
        this._state = this._state.updateIn(ref.slice(0,ref.length-1), function(val){
            val.delete(ref[ref.length-1]);
        });
        this.notify(ref, 'delete');
    }
};

Model.prototype.notify = function(path, signal){
    var ref = path.join('/');
    var data;
    if(signal !== 'delete'){
        data = this._state.getIn(path);
    }

    if(this._subscribers[ref] && this._subscribers[ref].length > 0){
        u.each(this._subscribers[ref], function(fn){
            fn(signal, data);
        });
    }
};

Model.prototype.subscribe = function(path, callback){
    if(u.isArray(path)){
        path = path.join('/');
    }
    if(!this._subscribers[path]){
        this._subscribers[path] = [];
    }
    this._subscribers[path].push(callback);
};

Model.prototype.bind = function(path){
    var self = this;
    return function(cb, init){
        self.subscribe(path, cb);
        if(u.isFunction(init)){
            init(self._state.getIn(path));
        }
    };
};


module.exports = Model;


