var dom = require('./selectors');
var $ = require('./dom');
var Immutable = require('immutable');

var tasks = Immutable.fromJS([
    {
        name: 'task 1',
        assignee: 'Julian',
        done: true
    },
    {
        name: 'task 2',
        assignee: 'Mike',
        done: false
    },
    {
        name: 'task 3',
        assignee: 'Andy',
        done: false
    }

]);

window.t = tasks;

var app = 
    $.ul(
    );

app(dom.main);

window.i = Immutable;
