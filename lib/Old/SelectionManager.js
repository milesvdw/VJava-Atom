export class SelectionManager
{
	this.selections:[]
	selectRight(dimName) {
		for (var i = 0; i < this.selections.length; i ++) {
			if (this.selections[i].name === dimName) {
				this.selections[i]['right'] = true;
			}
		}
	}

	// hide the right alternative
	unselectRight(dimName) {
		for (var i = 0; i < this.selections.length; i ++) {
			if (this.selections[i].name === dimName) {
				this.selections[i]['right'] = false;
			}
		}
	}

	// show the left alternative
	selectLeft(dimName) {
		for (var i = 0; i < this.selections.length; i ++) {
			if (this.selections[i].name === dimName) {
				this.selections[i]['left'] = true;
			}
		}
	},

	// hide the left alternative
	unselectLeft(dimName) {
		for (var i = 0; i < this.selections.length; i ++) {
			if (this.selections[i].name === dimName) {
				this.selections[i]['left'] = false;
			}
		}
	}
	addSelection(selection)
	{
		this.selections.push(selection);
	}
}
