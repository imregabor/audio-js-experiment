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
    var graph = scrollingCanvas(parent, 1024, 80).title('Instananeous and averaged total energy, relaxed max/min averaged energy (x3)').xaxisFromFps(60);


    var settings = {
        vu_size : 32,
        vu_draw_graph : true,
        vu_avg_window : 1,
        vu_avg_scale : 995,
        vu_br_range : 1.0,
        vu_scale_min : true,
        vu_decay_r : 997,
        vu_sustain_t : 3000,
        vu_bin_exponent : 2,

        updateVuSize : function() {
            display.setSize(settings.vu_size);
        }
    };

    var avgMax = 0.0; // Total averaged energy max
    var avgMaxLastSet = 0; // Last timestamp when averaged energy max set
    var avgMin = 0.0; // Total averaged energy min
    var avgMinLastSet = 0; // Last timestamp when total averaged energy min was set

    var instMax = 0.0; // Total instantaneous energy max
    var instMaxLastSet = 0; // Last timestamp when instantaneous energy max set
    var instMin = 0.0; // Total instantaneous energy min
    var instMinLastSet = 0; // Last instantaneous when total averaged energy min was set



    var energyBuffer = [];
    var energyBufferPos = 0;



    var vuf = gui.addFolder('VU Meter' + (name ? (' - ' + name) : ''));
    vuf.add(settings, 'vu_size').min(1).max(256).step(1).onChange(settings.updateVuSize);
    vuf.add(settings, 'vu_draw_graph');
    vuf.add(settings, 'vu_br_range').min(0).max(1);
    vuf.add(settings, 'vu_avg_window').min(1).max(50).step(1);
    vuf.add(settings, 'vu_avg_scale').min(1).max(1000);

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
            var instantaneousEnergy = 0;
            for (var i = 0; i < spectrum.length; i++) {
                var s = spectrum[i] / 255;
                var ss = s;
                for (var j = 1; j < settings.vu_bin_exponent; j++) {
                    ss *= s;
                }
                instantaneousEnergy += ss;
            }
            instantaneousEnergy /= spectrum.length;


            // Windowing
            // Maintenance : window size might have increased
            while (energyBuffer.length < settings.vu_avg_window) {
                energyBuffer.push(instantaneousEnergy);
            }
            // Maintenance : window size might have decreased and buffer might point out
            if (settings.vu_avg_window >= energyBufferPos) {
                energyBufferPos = 0;
            }
            energyBufferPos = (energyBufferPos + 1) % settings.vu_avg_window;
            energyBuffer[energyBufferPos] = instantaneousEnergy;

            var energyAvg = 0;

            var st = 0.0
            var p = energyBufferPos;
            for (var i = 0; i < settings.vu_avg_window; i++) {
                var scale = Math.pow(settings.vu_avg_scale / 1000, i);
                energyAvg += energyBuffer[p] * scale;

                st += scale;
                p--;
                if (p < 0) {
                    p = settings.vu_avg_window - 1;
                }
            }
            energyAvg /= st;



            if (ctims - avgMaxLastSet > settings.vu_sustain_t) {
                // wait predefined time before scaling down max
                avgMax *= settings.vu_decay_r / 1000;
            }
            if (ctims - avgMinLastSet > settings.vu_sustain_t) {
                // wait predefined time before scaling up min
                avgMin = 1 - ( 1 - avgMin) * settings.vu_decay_r / 1000;
            }
            if (ctims - instMaxLastSet > settings.vu_sustain_t) {
                // wait predefined time before scaling down max
                instMax *= settings.vu_decay_r / 1000;
            }
            if (ctims - instMinLastSet > settings.vu_sustain_t) {
                // wait predefined time before scaling up min
                instMin = 1 - ( 1 - instMin) * settings.vu_decay_r / 1000;
            }
            if ( energyAvg > avgMax ) { avgMax = energyAvg; avgMaxLastSet = ctims; }
            if ( energyAvg < avgMin ) { avgMin = energyAvg; avgMinLastSet = ctims; }
            if ( instantaneousEnergy > instMax ) { instMax = instantaneousEnergy; instMaxLastSet = ctims; }
            if ( instantaneousEnergy < instMin ) { instMin = instantaneousEnergy; instMinLastSet = ctims; }


            // scaled energy
            var scaledAvgEnergy;
            var scaledInstEnergy;
            if (settings.vu_scale_min) {
                scaledAvgEnergy = avgMax <= avgMin ? 0 : (energyAvg - avgMin)/(avgMax - avgMin);
                scaledInstEnergy = instMax <= instMin ? 0 : (instantaneousEnergy - instMin)/(instMax - instMin);
            } else {
                scaledAvgEnergy = avgMax <= 0 ? 0 : energyAvg /avgMax;
                scaledInstEnergy = instMax <= 0 ? 0 : instantaneousEnergy /instMax;
            }

            // display on graph
            if (settings.vu_draw_graph) {
                graph.barAndDot(scaledInstEnergy, scaledAvgEnergy, 3 * avgMax, 3 * avgMin);
            }

            // calc and display on lights
            var vudata = [];

            var pp = display.size * scaledAvgEnergy;
            for (var i = 0; i < display.size; i++) {
                var v = pp > 1.0 ? 1.0 : pp;
                pp -= v;
                vudata.push(v * (settings.vu_br_range * scaledAvgEnergy + 1 - settings.vu_br_range));
            }
            display.set(vudata);

        }
    };
    return ret;
}