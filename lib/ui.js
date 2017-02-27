'use babel';
import $ from 'jquery';
export class NestLevel {
}
export class Selector {
}
export class VJavaUI {
    constructor({ panel = null, session = [], dimensions = [], activeChoices = [], markers = [] }) {
        this.panel = panel;
        this.session = session;
        this.dimensions = dimensions; //TODO do we really need a session and a list of dimensions? are they the same?
        this.activeChoices = activeChoices;
        this.markers = markers;
    }
    serialize() {
        return { data: { panel: this.panel, session: this.session, dimensions: this.dimensions,
                activeChoices: this.activeChoices, markers: this.markers }, deserializer: "VJavaUI" };
    }
    hasDimension(name) {
        for (let dim of this.dimensions) {
            if (dim.name === name)
                return true;
        }
        return false;
    }
    sessionColorFor(name) {
        for (let dim of this.session) {
            if (dim.name === name)
                return dim.color;
        }
        return 'none';
    }
    updateSession(dimension) {
        for (var i = 0; i < this.session.length; i++) {
            var dim = this.session[i];
            if (dim.name === dimension.name) {
                this.session[i] = dimension;
                return;
            }
        }
        this.session.push(dimension);
    }
    getColorForNode(node) {
        var color;
        //next try the session color set
        var sessionColor = this.sessionColorFor(node.name);
        if (this.hasDimension(node.name)) {
            for (var dim of this.dimensions) {
                if (dim.name === node.name) {
                    color = dim.color;
                }
            }
        }
        else {
            if (sessionColor != 'none') {
                this.dimensions.push({ name: node.name, color: sessionColor, colorpicker: null });
                color = sessionColor;
            }
            else {
                this.dimensions.push({ name: node.name, color: 'rgb(127, 71, 62)', colorpicker: null });
                color = 'rgb(127, 71, 62)';
            }
        }
        return color;
    }
    getColorForDim(dimName) {
        var color;
        //next try the session color set
        var sessionColor = this.sessionColorFor(dimName);
        if (this.hasDimension(dimName)) {
            for (var dim of this.dimensions) {
                if (dim.name === dimName) {
                    color = dim.color;
                }
            }
        }
        else {
            if (sessionColor != 'none') {
                this.dimensions.push({ name: dimName, color: sessionColor, colorpicker: null });
                color = sessionColor;
            }
            else {
                this.dimensions.push({ name: dimName, color: '#6ea6ab', colorpicker: null });
                color = 'rgb(127, 71, 62)';
            }
        }
        return color;
    }
    setupColorPickerForDim(dimName, editor) {
        var dimUIElement;
        dimUIElement = this.getDimUIElementByName(dimName);
        dimUIElement.colorpicker = $(`#${dimName}-colorpicker`).spectrum({
            color: this.getColorForDim(dimName),
            preferredFormat: 'rgb'
        });
        return dimUIElement;
    }
    getDimUIElementByName(name) {
        for (var dim of this.dimensions) {
            if (dim.name === name)
                return dim;
        }
    }
    getSelector(dimName) {
        for (let choice of this.activeChoices) {
            if (choice.name === dimName)
                return choice;
        }
        return null;
    }
    shouldBeChecked(dimStatus, dimName) {
        var selector = this.getSelector(dimName);
        if (dimStatus === 'DEF') {
            return (selector && selector.status === dimStatus) ? 'checked' : '';
        }
        else if (dimStatus === 'NDEF') {
            return (selector && selector.status === dimStatus) ? 'checked' : '';
        }
        else if (dimStatus === 'BOTH') {
            return (!selector || selector.status === dimStatus) ? 'checked' : '';
        }
    }
}
