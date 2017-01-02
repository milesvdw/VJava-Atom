'use babel';

export class VJavaUI {
	panel: AtomCore.Panel;
	main: JQuery;
	session: {};
	secondary: JQuery;
	message: JQuery;
	dimensions: DimensionUI[]
}

export interface DimensionUI {
	name: string;
	color: string;
	colorpicker?: JQuery;
}
