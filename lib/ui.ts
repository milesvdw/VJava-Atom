'use babel';

export class VJavaUI {
	panel: AtomCore.Panel;
	main: JQuery;
	session: DimensionUI[];
	secondary: JQuery;
	message: JQuery;
	dimensions: DimensionUI[]

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
			this.session.push(dimension);
		}
	}
}

export class DimensionUI {
	name: string;
	color: string;
	colorpicker?: JQuery;
}
