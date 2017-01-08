'use babel';
import { ChoiceNode } from './ast'
import $ from 'jquery'

export class NestLevel {
  selector: Selector
  dimension: ChoiceNode
}

export class Selector {
  name: string
  branch: Branch
}

export class Selection {
  name: string
  thenbranch: boolean
  elsebranch: boolean
}

export type Branch = "thenbranch" | "elsebranch";

export class VJavaUI {
	panel: AtomCore.Panel;
	main: JQuery;
	session: DimensionUI[];
	secondary: JQuery;
	message: JQuery;
	dimensions: DimensionUI[];
	activeChoices: Selector[];

	hasDimension(name: string): boolean {
		for(let dim of this.dimensions) {
			if(dim.name === name) return true;
		}
		return false;
	}

	sessionColorFor(name: string): string {
		for(let dim of this.session) {
			if(dim.name === name) return dim.color;
		}
		return 'none';
	}

	updateSession(dimension: DimensionUI) {
		for(var i = 0; i < this.session.length; i ++) {
			var dim = this.session[i];
			if(dim.name === dimension.name) {
				this.session[i] = dimension
				return;
			}
		}
		this.session.push(dimension);
	}

	updateActiveChoices(dimName: string, branch: Branch): boolean {
		for(let choice of this.activeChoices) {
			if(choice.name === dimName) {
				choice.branch = branch;
				return;
			}
		}
		//if we didn't find this choice, insert a new one
		this.activeChoices.push({name: dimName, branch: branch});
		return;
	}

  getColorForNode(node: ChoiceNode) : string {
    var color;
    //next try the session color set
    var sessionColor: string = this.sessionColorFor(node.name);
    if(this.hasDimension(node.name)) {
      for(var dim of this.dimensions) {
        if(dim.name === node.name) {
          color = dim.color;
        }
      }
    } else {
      if(sessionColor != 'none') {
          this.dimensions.push({name: node.name, color: sessionColor, colorpicker: null})
          color =  sessionColor;
      } else {
          this.dimensions.push({name: node.name, color: '#7a2525', colorpicker: null})
          color = '#7z2525';
      }
    }
    return color;
  }

  getColorForDim(dimName: string) {
    var color;
    //next try the session color set
    var sessionColor: string = this.sessionColorFor(dimName);
    if(this.hasDimension(dimName)) {
      for(var dim of this.dimensions) {
        if(dim.name === dimName) {
          color = dim.color;
        }
      }
    } else {
      if(sessionColor != 'none') {
          this.dimensions.push({name: dimName, color: sessionColor, colorpicker: null})
          color =  sessionColor;
      } else {
          this.dimensions.push({name: dimName, color: '#7a2525', colorpicker: null})
          color = '#7z2525';
      }
    }
    return color;
  }

  setupColorPickerForDim(dimName: string, editor: AtomCore.IEditor, addViewListeners: Function, updateDimensionColor: Function) : void {
    var dimUIElement;
    dimUIElement = this.getDimUIElementByName(dimName);
    dimUIElement.colorpicker = $(`#${dimName}-colorpicker`).spectrum({
      color: this.getColorForDim(dimName)
    }).on('change', () => {
      dimUIElement.color = dimUIElement.colorpicker.spectrum('get').toHexString();
      updateDimensionColor(dimUIElement);
    });

    addViewListeners(dimUIElement);

  }

  getDimUIElementByName(name: string) : DimensionUI {
    for(var dim of this.dimensions) {
      if (dim.name === name) return dim;
    }
  }

	removeActiveChoice(dimName: string, branch: Branch) {
		for(var i = 0; i < this.activeChoices.length; i ++) {
			var choice = this.activeChoices[i];
			if(choice.name === dimName && choice.branch === branch) {
				this.activeChoices.splice(i,1);
				return;
			}
		}
	}

	getChoice(dimName: string): Selector {
		for(let choice of this.activeChoices) {
			if(choice.name === dimName) return choice;
		}
		return null;
	}
}

export interface DimensionUI {
	name: string;
	color: string;
	colorpicker?: JQuery;
}
