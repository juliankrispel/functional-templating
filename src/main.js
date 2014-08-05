var dom = require('./selectors');
var $ = require('./dom');
var Immutable = require('immutable');

window.t = tasks;

var tasks = [
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
];

var project = {
    title: { name: 'This is a list of tasks', link: 'http://google.com' },
    subTitle: 'By Julian',
    tasks: tasks
};


// There are two phases of creating a ui/template
// Number one is construction. We are using a set of
// functions to return a composite structure.
// Rendering can be initiated by simply executing the
// construct.
//


var list = $.ul(
    $.filterData('tasks'),
    $.each(
        $.li(
            $.h2($.filterData('name'), $.textContent()),
            $.h3($.filterData('assignee'), $.textContent()),
            $.strong($.filterData('done'), $.textContent())
        )
    )
);

var appConstruct = $.div(
    $.input($.id('taskName')),
    $.button($.id('addTask')),
    $.h1($.a(
        $.textContent($.filterData('title.name')),
        $.href($.filterData('title.link'))
    )),
    list
);

window.a = appConstruct;
appConstruct.render(dom.main, project);

window.i = Immutable;
