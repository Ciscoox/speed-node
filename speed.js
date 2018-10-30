const fetch = require('node-fetch');
const XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;
const fs = require('fs');

let dlStatus = '0.00'

let settings = {
    time_ul: 15, //duration of upload test in seconds
    time_dl: 15, //duration of download test in seconds
    count_ping: 35, //number of pings to perform in ping test
    url_dl: "190.102.252.188/js/garbage.php", //path to a large file or garbage.php, used for download test. must be relative to this js file
    url_ul: "empty.dat", //path to an empty file, used for upload test. must be relative to this js file
    url_ping: "empty.dat", //path to an empty file, used for ping test. must be relative to this js file
    url_getIp: "190.102.252.188/js/getIP.php", //path to getIP.php relative to this js file, or a similar thing that outputs the client's ip
    xhr_dlMultistream: 3, //number of download streams to use (can be different if enable_quirks is active)
    xhr_ulMultistream: 3, //number of upload streams to use (can be different if enable_quirks is active)
    xhr_dlUseBlob: false, //if set to true, it reduces ram usage but uses the hard drive (useful with large garbagePhp_chunkSize and/or high xhr_dlMultistream)
    garbagePhp_chunkSize: 20, //size of chunks sent by garbage.php (can be different if enable_quirks is active)
    enable_quirks: true, //enable quirks for specific browsers. currently it overrides settings to optimize for specific browsers, unless they are already being overridden with the start command

};

let xhr = null, //array of currently active xhr requests
    interval = null; //timer used in tests


function clearRequests() {

    if (xhr) {
        for (var i = 0; i < xhr.length; i++) {
            try {
                xhr[i].onprogress = null;
                xhr[i].onload = null;
                xhr[i].onerror = null
            } catch (e) {}
            try {
                xhr[i].upload.onprogress = null;
                xhr[i].upload.onload = null;
                xhr[i].upload.onerror = null
            } catch (e) {}
            try { xhr[i].abort() } catch (e) {}
            try { delete(xhr[i]) } catch (e) {}
        }
        xhr = null;
    }
}


let getIP = fetch('http://velocidad.mundopacifico.cl/js/getIP.php');
getIP.then(resp => resp.json())
    .then(newRes => {
        console.log(newRes);
    })
    .catch(error => console.log);



// let dl = fetch(settings.url_dl + "?r=" + Math.random() + "&ckSize=" + settings.garbagePhp_chunkSize);

// dl.then(res => {
//     return new Promise((resolve, reject) => {
//         const dest = fs.createReadStream(res);
//         res.body.pipe(dest);
//         res.body.on('error', err => {
//             reject(err);
//         });

//     })
// })


let dlCalled = false;

function dlTest() {
    if (dlCalled) return;
    else dlCalled = true; //dlTest already called?
    let totLoaded = 0.0, //total number of loaded bytes
        startT = new Date().getTime(), //timestamp when test was started
        failed = false; //set to true if a stream fails
    xhr = [];
    //function to create a download stream. streams are slightly delayed so that they will not end at the same time
    let testStream = function(i, delay) {
        setTimeout(function() {
            //delayed stream ended up starting after the end of the download test

            let prevLoaded = 0; //number of bytes loaded last time onprogress was called

            xhr[i] = new XMLHttpRequest();
            xhr[i].onprogress = function(event) {

                //progress event, add number of new loaded bytes to totLoaded
                let loadDiff = event.loaded <= 0 ? 0 : (event.loaded - prevLoaded);
                if (isNaN(loadDiff) || !isFinite(loadDiff) || loadDiff < 0) return; //just in case
                totLoaded += loadDiff;
                prevLoaded = event.loaded;
            }.bind(this);
            xhr[i].onload = function() {
                //the large file has been loaded entirely, start again
                try { xhr[i].abort(); } catch (e) {} //reset the stream data to empty ram
                testStream(i, 0);
            }.bind(this);
            xhr[i].onerror = function() {
                //error, abort
                failed = true;
                try { xhr[i].abort(); } catch (e) {}
                delete(xhr[i]);
            }.bind(this);
            //send xhr
            try {
                if (settings.xhr_dlUseBlob) xhr[i].responseType = 'blob';
                else xhr[i].responseType = 'arraybuffer';
            } catch (e) {}
            xhr[i].open("GET", settings.url_dl + "?r=" + Math.random() + "&ckSize=" + settings.garbagePhp_chunkSize, true); //random string to prevent caching
            xhr[i].send();

        }.bind(this), delay);
    }.bind(this);
    //open streams
    for (let i = 0; i < settings.xhr_dlMultistream; i++) {
        testStream(i, 100 * i);
    }
    //every 200ms, update dlStatus
    interval = setInterval(function() {
        let t = new Date().getTime() - startT;
        if (t < 200) return;
        let speed = totLoaded / (t / 1000.0);
        dlStatus = ((speed * 8) / 925000.0).toFixed(2); //925000 instead of 1048576 to account for overhead
        console.log(dlStatus);
        if ((t / 1000.0) > settings.time_dl || failed) { //test is over, stop streams and timer
            if (failed || isNaN(dlStatus)) dlStatus = "Fail";
            clearRequests();
            clearInterval(interval);

        }
    }.bind(this), 200);
}

dlTest();