div(
    each(data, span)
);

var project = {
    title: 'This is a list of tasks',
    subTitle: 'By Julian',
    tasks: ['one', 'two', 'three']
};


// There are two phases of creating a ui/template
// Number one is construction. We are using a set of
// functions to return a composite structure.
// Rendering can be initiated by simply executing the
// construct.

var appConstruct = $.div(
    $.h1($.data('title')),
    $.h2($.data('subTitle')),
    $.ul(
        $.data('tasks'),
        $.each(
            $.li()
        )
    )
);

// Number two is execution
app($element, data);

var o = {
    title: 'Title',
    subtitle: 'subtitle'
}

var Model = function(obj){
    u.each(obj, function(o){

    });
};

var m = Model({
    title: 'hello',
    subTitle: 'This is the world,
    tasks: [ { _uid: 'd321e2', val: 'Task1'}, 'Task2']
});

m.each('tasks',
    $.li($.textContent())
)


var app = dom.div(
    dom.h1(m('title'))
);
