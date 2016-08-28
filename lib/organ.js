"use strict";


/**
 * Create an array of multi channel organs.
 *
 * Individual organs can have different parameterizations.
 *
 * @param {type} parent
 * @param {type} gui
 * @param {type} name
 * @returns {undefined}
 */
var organ2d = function(parent, gui, name) {

    var settings = {
        channels : 32,
        stages : 6,
        max_freq : 2500,
        span : 2
    };


    var display = lightDisplay2d(parent, settings.channels, settings.stages);

    // Current sampling parameters
    // Set in ret.changeSamplingParameters
    var currentSampleRate;
    var currentFftBinCount;

    // Current channel grouping
    var grouping;

    // When set will be invoked with the channel allocation
    var notifybinsizes;

    var maxes;
    var buff  = buffer(settings.stages);


    // Reset internal variables
    var resetState = function() {
        maxes = [];
        for (var i = 0; i < settings.stages; i++) {
            var si = autoscale(settings.channels);
            si.scale_min = false;
            si.spill_r = 0.3;
            si.sustain_t = 20;
            si.decay_r = 960;
            maxes.push(si);
        }
        if (buff) { buff.clear(); }
    };

    // Update channel grouping
    var updateGrouping = function() {
        if (!currentSampleRate) { throw new Error('Sample rate not defined'); }
        if (!currentFftBinCount) { throw new Error('Fft bin count not defined'); }

        grouping = organ.alloc(currentSampleRate, currentFftBinCount, settings.max_freq, settings.channels, settings.span);
        if (notifybinsizes) {
            notifybinsizes(grouping.sizes);
        }
        resetState();
    };

    // Update organ layout
    var updateLayout = function() {
        display.setSize(settings.channels, settings.stages);
        buff = buffer(settings.stages);
        updateGrouping();

    };


    var f = gui.addFolder('2D Light organ' + (name ? (' - ' + name) : ''));
    f.add(settings, 'channels').min(1).max(256).step(1).onChange(updateLayout);
    f.add(settings, 'stages').min(1).max(16).step(1).onChange(updateLayout);
    f.add(settings, 'max_freq').min(100).max(20000).step(1).onChange(updateGrouping);
    f.add(settings, 'stages').min(1).max(16).onChange(updateGrouping);
    f.open();


    var ret = {
        /**
         * Register callback for visualizing fft bin grouping (channel allocation)
         * @param f Function to call with the channel sizes array
         */
        notifybinsizes : function(f) {
            notifybinsizes = f;
            if (grouping) {
                f(grouping.sizes);
            }
            return ret;
        },
        changeSamplingParameters : function(freqBinCount, samplerate) {
            currentSampleRate = samplerate;
            currentFftBinCount = freqBinCount;
            updateGrouping();
            resetState();
            return ret;
        },
        /**
         * Notify new spectrum.
         * @param spectrum  scaled to 0..1
         * @param samplerate  sample rate
         * @param ctims current time stamp in ms
         * @returns {undefined}
         */
        normalizedFrequencyData : function(spectrum, samplerate, ctims) {
            if (!grouping) {
                throw new Error('Illegal state');
            }
            buff.add(spectrum);

            var b = buff.getAll();

            var stages_raw_e = [];


            for (var j = 0; j < b.length; j++) {
                stages_raw_e.push([]);
            }
            for (var i = 0; i < spectrum.length; i++) {
                var e = b[0][i];
                stages_raw_e[0].push(e);
                for (var j = 1; j < b.length; j++) {
                    e *= b[j][i];
                    stages_raw_e[j].push(e);
                }
            }

            var out = [];
            for (var j = b.length - 1; j >= 0; j--) {
                out.push(maxes[j].scale(grouping.group(stages_raw_e[j])));
            }


            if (out.length === settings.stages) {
                display.set(out);
            }

        }
    };
    return ret;

};


/**
 * Create a multi channel light organ effect.
 *
 * Currently non overlapping spectrum distribution is implemented. Support for overlapping bands would be desired.
 *
 * @param parent Parent component to add the output
 * @param gui dat.gui instance to add parameters
 * @param name Optional name to use in the DAT.GUI group
 */

var organ = function(parent, gui, name) {
    var display = lightsDisplay(parent, 32);


    // Current sampling parameters
    // Set in ret.changeSamplingParameters
    var currentSampleRate;
    var currentFftBinCount;

    // Current channel grouping
    var grouping;

    // When set will be invoked with the channel allocation
    var notifybinsizes;


    var settings = {
        organ_size : 32,
        max_freq : 2500, // 3500,
        span : 2, // 32,
        bin_exponent : 2,
        scale_min : false, // true,
        decay_r : 997,
        mm_ch_spill_r : 0.05,

        updateGrouping : function() {
            if (!currentSampleRate) { throw new Error('Sample rate not defined'); }
            if (!currentFftBinCount) { throw new Error('Fft bin count not defined'); }

            grouping = organ.alloc(currentSampleRate, currentFftBinCount, settings.max_freq, settings.organ_size, settings.span);
            if (notifybinsizes) {
                notifybinsizes(grouping.sizes);
            }
            resetState();

        },

        updateOrganSize : function() {
            display.setSize(settings.organ_size);
            settings.updateGrouping();
        }

    };

    var orf = gui.addFolder('Light organ' + (name ? (' - ' + name) : ''));
    orf.add(settings, 'organ_size').min(1).max(256).step(1).onChange(settings.updateOrganSize);
    orf.add(settings, 'max_freq').min(100).max(20000).onChange(settings.updateGrouping);
    orf.add(settings, 'span').min(1).max(1000).onChange(settings.updateGrouping);
    orf.add(settings, 'bin_exponent', [1, 2]).onChange(resetState);
    orf.add(settings, 'scale_min');
    orf.add(settings, 'decay_r').min(900).max(1000);
    orf.add(settings, 'mm_ch_spill_r').min(0).max(1);
    orf.open();



    var maxE;
    var minE;
    var resetState = function() {
        maxE = [];
        minE = [];
    };
    resetState();

    var ret = {
        /**
         * Register callback for visualizing fft bin grouping (channel allocation)
         * @param f Function to call with the channel sizes array
         */
        notifybinsizes : function(f) {
            notifybinsizes = f;
            if (grouping) {
                f(grouping.sizes);
            }
            return ret;
        },
        changeSamplingParameters : function(freqBinCount, samplerate) {
            currentSampleRate = samplerate;
            currentFftBinCount = freqBinCount;
            settings.updateGrouping();

            resetState();

            return ret;
        },
        /**
         * Notify new spectrum.
         * @param spectrum  scaled to 0..1
         * @param samplerate  sample rate
         * @param ctims current time stamp in ms
         * @returns {undefined}
         */
        normalizedFrequencyData : function(spectrum, samplerate, ctims) {
            if (!grouping) {
                throw new Error('Illegal state');
            }


            // instantaneous energies in the channels
            // also store min/max energies with channel independent decays
            var instE = [];
            var k = 0;
            for (var i = 0; i < grouping.sizes.length; i++) {
                var ei = 0;
                for (var j = 0; j < grouping.sizes[i]; j++) {
                    var ek = spectrum[k];
                    for (var l = 1; l < settings.bin_exponent; l++) {
                        ek *= spectrum[k];
                    }
                    k++;
                    ei += ek;
                }
                ei /= grouping.sizes[i];
                instE.push(ei);
                if (!maxE[i]) {
                    maxE[i] = ei;
                    minE[i] = ei;
                } else {
                    maxE[i] *= settings.decay_r / 1000;
                    minE[i] = 1 - (1 - minE[i]) * settings.decay_r / 1000;
                    if (maxE[i] < ei) {
                        maxE[i] = ei;
                    }
                    if (minE[i] > ei) {
                        minE[i] = ei;
                    }
                }
            }

            // Normalized values - sent to lights
            var normV = [];

            // Channel spill from relative to count
            var cs = Math.round(settings.mm_ch_spill_r * instE.length);

            for (var i = 0; i < instE.length; i++) {

                var v;
                var min = minE[i];
                var max = maxE[i];

                // Collect max/min from the neighboring channels
                for (var j = Math.max(-cs, -i); j <= cs; j++) {
                    var ii = i + j;
                    if (ii < 0) {
                        continue;
                    }
                    if (ii >= instE.length) {
                        break;
                    }
                    if (minE[ii] < min) { min = minE[ii]; }
                    if (maxE[ii] > max) { max = maxE[ii]; }
                }

                // normalize according to the settings
                if (settings.scale_min) {
                    v = (instE[i] - min) / (max - min);
                } else {
                    v = instE[i] / max;
                }
                normV.push(v);
            }

            // send to the display
            display.set(normV);

        },

        /**
         * Notify new spectrum.
         * @param spectrum - as an uint8
         * @param samplerate - sample rate
         * @param ctims - current time stamp
         * @returns {undefined}
         */
        byteFrequencyData : function(spectrum, samplerate, ctims) {
            var norm = [];
            for (var i = 0; i < spectrum.length; i++) {
                norm.push(spectrum[i] / 255);
            }
            return ret.normalizedFrequencyData(norm, samplerate, ctims);
        }

    };
    return ret;
};

/**
 * Allocate bands to group.
 *
 * @param samplerate Audio sample rate
 * @param freqBinCount FFT frequency bin count
 * @param maxFreq frequency to represent
 * @param groups number of final groups
 * @param span Frequency span ratio of last/first band
 */
organ.alloc = function(samplerate, freqBinCount, maxFreq, groups, span) {
    var ret = {
        samplerate : samplerate,
        freqBinCount : freqBinCount,
        maxFreq : maxFreq,
        count : groups,
        a : span,
        sizes : undefined,
        group : function(spectrum, exponent) {
            if (spectrum.length !== ret.freqBinCount) {
                throw new Error('Unexpected spectrum size ' + spectrum.length + ', expected ' + ret.freqBinCount);
            }
            exponent = exponent ? exponent : 1;
            var out = [];
            var k = 0;
            for (var i = 0; i < ret.sizes.length; i++) {
                var ei = 0;
                for (var j = 0; j < ret.sizes[i]; j++) {
                    var ek = spectrum[k];
                    for (var l = 1; l < exponent; l++) {
                        ek *= spectrum[k];
                    }
                    k++;
                    ei += ek;
                }
                ei /= ret.sizes[i];
                out.push(ei);
            }
            return out;
        }
    };




    // Target bin count to cover specified frequencies
    var targetbinct = Math.round(2 * freqBinCount * maxFreq / samplerate);

    if (groups === 1) {
        ret.sizes = [ targetbinct ];
        return ret;
    }


    // Bin widths are                                   w[i] = a * (b ^ i)
    // Where                                            0 <= i < count
    // We expect                                        w[count - 1] / w[0] = span
    // Thus                                             b ^ (count - 1) = span
    var b = Math.pow(span, 1 / (groups - 1));




    // console.log('Target bin count:', targetbinct, 'exp', exp);

    // Sizes of non overlapping groups
    var sizes = [];

    // Total covered fft bins
    var totalct =0;

    var a = targetbinct / (1 - Math.pow(b, groups)) * (1 - b);
    // console.log('b', b);

    for (var i = 0; i < groups; i++) {
        var gi = Math.round(a * Math.pow(b, i));
        sizes.push(gi);
        totalct += gi;
    }

    // console.log('After first allocation:', sizes);

    for (var i = 0; i < sizes.length; i++) {
        if (sizes[i] < 1) {
            totalct += 1 - sizes[i];
            sizes[i] = 1;
        }
    }

    while (totalct > targetbinct) {
        var found = false;
        for (var i = 0; i < sizes.length && totalct > targetbinct; i++) {
            if (sizes[i] > 1) {
                totalct --;
                sizes[i] --;
                found = true;
            }
        }
        if (!found) {
            break;
        }
    }

    // Adjust bin sizes
    while (totalct < targetbinct) {
        for (var i = sizes.length - 1; i >= 0 && totalct < targetbinct; i--) {
            totalct ++;
            sizes[i] ++;
        }
    }

    // console.log('Groups allocation', sizes);

    ret.sizes = sizes;

    return ret;
};