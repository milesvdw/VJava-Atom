'use babel';

export class VJavaUI {
	panel: AtomCore.Panel;
	main: JQuery;
	session: {};
	secondary: JQuery;
	message: JQuery;
	dimensions: DimensionUI[]

	hasDimension(name: string): boolean {
		for(let dim of this.dimensions) {
			if(dim.name === name) return true;
		}
		return false;
	}
}

export class DimensionUI {
	name: string;
	color: string;
	colorpicker?: JQuery;
}
