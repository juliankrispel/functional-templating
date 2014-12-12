var dom = require('./selectors');
var $ = require('./dom');
var Immutable = require('immutable');
var Model = require('./model');


var m = new Model({
    tasks: [
        {title: 'Do chorse', assignee: 'Julian'},
        {title: 'Do washing', assignee: 'Julian'},
        {title: 'Do homework', assignee: 'Julian'}
    ]
});

var div = function(bind){
    return function($parent){
        var self = this;
        this.el = document.createElement('div');
        $parent.appendChild(this.el);

        bind(function(signal, val){
            self.el.textContent = val;
        },function(data){
            self.el.textContent = data;
        });
    };
};

var app = div(m.bind(['tasks', '0', 'assignee']));

setTimeout(function(){
    m.update(['tasks', '0', 'assignee'], 'Mike');
}, 1000);

app(dom.main);

//var tasks = {
//    '0': {
//        name: 'task 1',
//        assignee: 'Julian',
//        done: true
//    },
//    '1': {
//        name: 'task 2',
//        assignee: 'Mike',
//        done: false
//    },
//    '2': {
//        name: 'task 3',
//        assignee: 'Andy',
//        done: false
//    }
//};
//
//var project = Immutable.fromJS({
//    title: { name: 'This is a list of tasks', link: 'http://google.com' },
//    subTitle: 'By Julian',
//    tasks: tasks
//});
//
//
//// There are two phases of creating a ui/template
//// Number one is construction. We are using a set of
//// functions to return a composite structure.
//// Rendering can be initiated by simply executing the
//// construct.
////
//
//var list = $.ul(
//    $.get('tasks'),
//    $.each(
//        $.li(
//            $.h2($.get('name'), $.textContent()),
//            $.h3($.get('assignee'), $.textContent()),
//            $.strong($.get('done'), $.textContent())
//        )
//    )
//);
//
//var appConstruct = $.div(
//    $.input($.id('taskName')),
//    $.button(
//        $.id('addTask'), 
//        $.textContent('Add a Task')
//    ),
//    $.h1($.a(
//        $.textContent($.get('title.name')),
//        $.href($.get('title.link'))
//    )),
//    list
//);
//
//appConstruct.execute(dom.main, project);
