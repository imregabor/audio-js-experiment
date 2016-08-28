"use strict";

/*
 * Common signal processing related utilities, components.
 */

/**
 * Get AudioContext.
 * @returns AudioContext to use
 */
function getAudioContext() {
    // From http://ianreah.com/2013/02/28/Real-time-analysis-of-streaming-audio-data-with-Web-Audio-API.html
    if (typeof AudioContext !== "undefined") {
        return new AudioContext();
    } else if (typeof webkitAudioContext !== "undefined") {
        return new webkitAudioContext();
    } else {
        throw new Error('No AudioContext available');
    }
}

/**
 * Create a buffer.
 * @param size Buffer size
 */
function buffer(size) {
    // 0 is the most recent
    var buffer = [];

    var ret = {
        size : size,
        add : function(v) {
            var newBuffer = [];
            newBuffer.push(v);
            for (var i = 0; i < size - 1 && i < buffer.length; i++) {
                newBuffer.push(buffer[i]);
            }
            buffer = newBuffer;
            return v;
        },
        getAll : function() {
            return buffer;
        },
        clear : function() {
            buffer = [];
        },
        setSize : function(newSize) {
            if (buffer.length > newSize) {
                var newBuffer = [];
                for (var i = 0; i < newSize; i++) {
                    newBuffer.push(buffer[i]);
                }
                buffer = newBuffer;
            }
            ret.size = newSize;
        }
    };
    return ret;
}

/**
 * Auto scale an array of inputs.
 *
 * @param size Channel count
 */
function autoscale(size) {
    var maxes;
    var mins;
    var lastt;
    var ret = {
        // Channel count
        size : size,

        // Man/mix decay rate (x 10000) per update
        decay_r : 995,

        // Scale mins to 0
        scale_min : false,

        // Time before decay starts
        sustain_t : 3000,

        // Spill ratio in terms of channel counts
        spill_r : 0.0,

        // Last spilled value
        spill_low_f : 0.0,

        clear : function() {
            maxes = undefined;
            mins = undefined;
            lastt = undefined;
        },
        setSize : function(newSize) {
            ret.clear();
            ret.size = newSize;
        },
        scale : function(input) {
            if (input.length !== ret.size) {
                throw new Error('Unexpected size ' + input.length + ', expected ' + ret.size);
            }
            var t = Date.now();
            if (!maxes) {
                maxes = [];
                mins = [];
                lastt = [];
                for (var i = 0; i < ret.size; i++) {
                    maxes.push(input[i]);
                    mins.push(input[i]);
                    lastt.push(t);
                }
            }

            for (var i = 0; i < ret.size; i++) {
                // decay
                if (t - ret.sustain_t >= lastt[i]) {
                    maxes[i] *= ret.decay_r / 1000;
                    mins[i] =  1 - (1 - mins[i]) * ret.decay_r / 1000;
                }

                // admin mins/maxes
                var ii = input[i];
                if (ii < mins[i]) {
                    mins[i] = ii;
                    lastt[i] = t;
                }
                if (ii > maxes[i]) {
                    maxes[i] = ii;
                    lastt[i] = t;
                }
            }

            var output = [];

            // Channel spill from relative to count
            var cs = Math.round(ret.spill_r * ret.size);

            for (var i = 0; i < ret.size; i++) {

                var v;
                var min = mins[i];
                var max = maxes[i];

                // Collect max/min from the neighboring channels
                for (var j = Math.max(-cs, -i); j <= cs; j++) {
                    var ii = i + j;
                    if (ii < 0) {
                        continue;
                    }
                    if (ii >= ret.size) {
                        break;
                    }
                    var f = 1 - (1 - ret.spill_low_f) * Math.abs(j) / cs;

                    if (1 - f * (1 - mins[ii]) < min) { min = 1 - f * (1 - mins[ii]); }
                    if (maxes[ii] * f > max) { max = maxes[ii] * f; }
                }

                // normalize according to the settings
                if (ret.scale_min) {
                    v = (input[i] - min) / (max - min);
                } else {
                    v = input[i] / max;
                }
                output.push(v);
            }
            return output;
        }
    };
    return ret;
}



/**
 * Create an analyzer and chain it to the destination.
 *
 * @param parent Parent element for display
 * @param gui dat.gui to set settings
 * @returns Spectrum source
 */
function spectrumSource(parent, gui) {
    // Spectrum clients
    //
    // Expected methods:
    // changeSamplingParameters(freqBinCount, samplerate)
    // byteFrequencyData(spectrum, samplerate, currentTime) or  normalizedFrequencyData(spectrum, samplerate, currentTime)
    var clients = [];
    var clientSpectrumSources = [];

    var audioContext = getAudioContext();
    var analyser = audioContext.createAnalyser();
    analyser.smoothingTimeConstant = 0;
    analyser.connect(audioContext.destination);


    var scrollingSpectrumDisplay = scrollingCanvas(parent, 800, 512).title('Bottom part of main spectrum').xaxisFromFps(60).yaxis([0, 100]);
    var simpleSpectrumDisplay = scrollingCanvas(parent, 1024, 80).title('Spectrum');

    var settings = {
        fft_size : 4096,
        draw_spectrum : true,
        draw_analyser : true,
        clip_high : true
    };


    // Update spectrum displays with adjusted axes
    var updateSpectrumDisplay = function() {
        scrollingSpectrumDisplay.clear();
        simpleSpectrumDisplay.clear();
        scrollingSpectrumDisplay.yaxisFromFftParams(audioContext.sampleRate, analyser.frequencyBinCount, settings.clip_high);
        simpleSpectrumDisplay.xaxisFromFftParams(audioContext.sampleRate, analyser.frequencyBinCount, settings.clip_high);
    }

    // Uint8 array to read spectrum
    var frequencyData;
    var normalizedFrequencyData;

    // Update when sampling parameters (fft size or samplerate) changed
    var updateSamplingParams = function() {
        analyser.fftSize = settings.fft_size;
        frequencyData = new Uint8Array(analyser.frequencyBinCount);

        for (var i = 0; i < clients.length; i++) {
            clients[i].changeSamplingParameters(analyser.frequencyBinCount, audioContext.sampleRate);
        }
        updateSpectrumDisplay();
    };
    updateSamplingParams();


    var spf = gui.addFolder('Spectrum');
    spf.add(settings, 'fft_size', [ 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536]).onChange(updateSamplingParams);
    spf.add(settings, 'draw_spectrum').onChange(scrollingSpectrumDisplay.show);
    spf.add(settings, 'draw_analyser').onChange(simpleSpectrumDisplay.show);
    spf.add(settings, 'clip_high').onChange(updateSpectrumDisplay);
    spf.open();



    var ret = {
        vscaleBins : scrollingSpectrumDisplay.vscaleBins,
        getAudioContext : function() {
            return audioContext;
        },
        getSampleRate : function() {
            return audioContext.sampleRate;
        },
        getAnalyser : function() {
            return analyser;
        },
        lastUint8Spectrum : function() {
            return frequencyData;
        },
        lastNormalizedSpectrum : function() {
            return normalizedFrequencyData;
        },
        addClient : function(client, sps) {
            clients.push(client);
            if (sps) {
                clientSpectrumSources.push(sps);
            } else {
                clientSpectrumSources.push(ret);
            }
            // notify client with the current sampling parameters
            client.changeSamplingParameters(analyser.frequencyBinCount, audioContext.sampleRate);
            return ret;
        },
        // Get spectrum, draw and distribute to clients
        ping : function() {
            var ctims = Date.now();
            analyser.getByteFrequencyData(frequencyData);

            normalizedFrequencyData = [];
            for (var i = 0; i < frequencyData.length; i++) {
                normalizedFrequencyData.push(frequencyData[i] / 255);
            }

            if (settings.draw_spectrum) {
                scrollingSpectrumDisplay.byteFreqData(frequencyData, settings.clip_high);
            }
            if (settings.draw_analyser) {
                simpleSpectrumDisplay.simpleSpectrum(frequencyData, settings.clip_high);
                //  pss.simpleSpectrum(sums);
            }


            for (var i = 0; i < clients.length; i++) {
                if (clients[i].normalizedFrequencyData) {
                    clients[i].normalizedFrequencyData(clientSpectrumSources[i].lastNormalizedSpectrum(), audioContext.sampleRate, ctims);
                } else {
                    clients[i].byteFrequencyData(clientSpectrumSources[i].lastUint8Spectrum(), audioContext.sampleRate, ctims);
                }
            }
        }
    };




    return ret;
}
