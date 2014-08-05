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

