"use strict";


/**
 * Playground for spectrum transformations.
 */


var transformSpectrum = function(parent, gui) {

    var simpleSpectrumDisplay = scrollingCanvas(parent, 1024, 80).title('Spectrum');



    var buffer = [];
    var bp = 0;

    var settings = {
        buffer_size : 5
    };



    var clean = function() {
        buffer = [];
    };

    var f = gui.addFolder('Transform spectrum');
    f.add(settings, 'buffer_size').min(1).max(50).step(1).onChange(clean);
    f.open();

    var last;

    var ret = {
        changeSamplingParameters : function(freqBinCount, samplerate) {
            clean();

        },
        normalizedFrequencyData : function(spectrum, samplerate, ctims) {
            if (buffer.length < settings.buffer_size) {
                buffer.push(spectrum);
                bp = buffer.length - 1;
            } else {
                bp = (bp + 1) % settings.buffer_size;
                buffer[bp] = spectrum;
            }


            last = [];
            for (var i = 0; i < spectrum.length; i++) {
                var v = buffer[0][i];
                for (var j = 1; j < buffer.length; j++) {
                    v *= buffer[j][i];
                }
                // v /= buffer.length;
                last.push(v);
            }

            simpleSpectrumDisplay.simpleNormalizedSpectrum(last, true);
        },
        lastNormalizedSpectrum : function() {
            return last;
        }

    };

    return ret;

}