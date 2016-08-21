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
