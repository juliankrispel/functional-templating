var gulp = require('gulp'),
    fs = require('fs'),
    connect = require('gulp-connect'),
    watch = require('gulp-watch'),
    browserify = require('gulp-browserify'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename');


gulp.task('browserify', function(){
    gulp.src('./src/main.js', {read: false})
        .pipe(browserify({
            insertGlobals: true,
            extensions: ['.js']
        }))
        .on('error', function(e,d){
            console.log('browserify encountered an error: ', e,d);
        })
        .pipe(rename({basename: 'main', extname: '.js'}))
        .pipe(gulp.dest('./dist/'));
});

gulp.task('connect', function() {
});

var watcher = gulp.watch('./src/**.js', ['browserify']);

gulp.task('default', function(){
    watcher.on('change', function(event){
        console.log('File '+event.path+' was '+event.type+', running tasks...');
    });
    connect.server({port: 9002});
});
