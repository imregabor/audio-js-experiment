"use strict";


/**
 * Create a VUmeter effect.
 *
 * lightsDisplay and scrollingCancvas components must be present
 *
 * @param parent Parent component to add the output
 * @param gui dat.gui instance to add parameters
 * @param name Optional name to use in the DAT.GUI group
 */
function vumeter(parent, gui, name) {
    var display = lightsDisplay(parent, 32);
    var graph = scrollingCanvas(parent, 1024, 80).title('Scaled total energy and relaxed max energy (x3)').xaxisFromFps(60);


    var settings = {
        vu_size : 32,
        vu_br_range : 1.0,
        vu_scale_min : true,
        vu_decay_r : 997,
        vu_sustain_t : 3000,
        vu_bin_exponent : 2,

        updateVuSize : function() {
            display.setSize(settings.vu_size);
        }
    };

    var ma = 0.0; // Total energy max
    var maLastSet = 0; // Last timestamp when total energy max set
    var mi = 0.0; // Total energy min
    var miLastSet = 0; // Last timestamp when total energy min was set



    var vuf = gui.addFolder('VU Meter' + (name ? (' - ' + name) : ''));
    vuf.add(settings, 'vu_size').min(1).max(256).step(1).onChange(settings.updateVuSize);
    vuf.add(settings, 'vu_br_range').min(0).max(1);
    vuf.add(settings, 'vu_scale_min');
    vuf.add(settings, 'vu_decay_r');
    vuf.add(settings, 'vu_sustain_t');
    vuf.add(settings, 'vu_bin_exponent', [1, 2]);
    vuf.open();

    var ret = {
        /**
         * Notify new spectrum.
         * @param spectrum - as an uint8
         * @returns {undefined}
         */
        byteFrequencyData : function(spectrum) {
            // Current time stamp
            var ctims = Date.now();

            // Calc instantaneous energy
            var energy = 0;
            for (var i = 0; i < spectrum.length; i++) {
                var s = spectrum[i] / 255;
                var ss = s;
                for (var j = 1; j < settings.vu_bin_exponent; j++) {
                    ss *= s;
                }
                energy += ss;
            }
            energy /= spectrum.length;

            if (ctims - maLastSet > settings.vu_sustain_t) {
                // wait predefined time before scaling down max
                ma *= settings.vu_decay_r / 1000;
            }
            if (ctims - miLastSet > settings.vu_sustain_t) {
                // wait predefined time before scaling up min
                mi = 1 - ( 1 - mi) * settings.vu_decay_r / 1000;
            }
            if ( energy > ma ) { ma = energy; maLastSet = ctims; }
            if ( energy < mi ) { mi = energy; miLastSet = ctims; }


            // scaled energy
            var scaledEnergy;
            if (settings.vu_scale_min) {
                scaledEnergy = ma <= mi ? 0 : (energy - mi)/(ma - mi);
            } else {
                scaledEnergy = ma <= 0 ? 0 : energy /ma;
            }

            // display on graph
            graph.barAndDot(scaledEnergy, 3 * ma, 3 * mi);

            // calc and display on lights
            var vudata = [];

            var pp = display.size * scaledEnergy;
            for (var i = 0; i < display.size; i++) {
                var v = pp > 1.0 ? 1.0 : pp;
                pp -= v;
                vudata.push(v * (settings.vu_br_range * scaledEnergy + 1 - settings.vu_br_range));
            }
            display.set(vudata);

        }
    };
    return ret;
}