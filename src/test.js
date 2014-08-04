div(
    each(data, span)
);

var project = {
    title: 'This is a list of tasks',
    subTitle: 'By Julian',
    tasks: ['one', 'two', 'three']
};


// There are two phases of creating a ui/template
// Number one is construction

var appConstruct = $.div(
    $.data(project),
    $.h1('This is a list of Tasks'),
    $.h2($.data()),
    $.ul(
        $.each()
    )
)

// Number two is execution
app();

