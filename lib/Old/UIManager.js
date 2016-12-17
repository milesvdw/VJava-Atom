export class UIManager
{
	var mainDivId = 'variationalJavaUI';
	var enclosingDivId = 'enclosingDivJavaUI';
	var secondaryDivId = 'variationalJavaUIButtons';

	atomPanel:{}
	main: {}
	secondary:{}
	message: {}

	constructor()
	{
	}

	initUI()
	{
		var panelElement = $(`<div id='${enclosingDivId}'><div id='${mainDivId}'></div>
                           <div id='${secondaryDivId}' class='vjava-secondary'>
                             <a href='' id='addNewDimension'><img id='addNewDimensionImg' border="0" src="${iconsPath}/add_square_button.png" width="30" height="30"/> </a>
                           </div></div>`);
		atomPanel = atom.workspace.addRightPanel({item: panelElement});
		atomPanel.hide();
	}
	renderDocument(doc, selections)
	{
		var finalContents = [];
		for(var i = 0; i < vjava.doc.length; i ++) {
			finalContents.push(this.renderDocContent(vjava.doc[i], selections));
		}
		finalContents = finalContents.join('');
	}
	renderDocContent(item, selections)
	{
    if(item.type === 'choice') {
      //found is used to see if any selections have been made - if this is a brand new dimension, default both branches to shown
      var found = false;
      var selection;
      for (var i = 0; i < selections.length; i ++) {
        if (selections[i].name === item.dimension) {
          found = true;
          selection = vjava.selections[i];
          break;
        }
      }

      var left = "";
      if(!found || selection['left']) {
        for(var j = 0; j < item.left.length; j ++) {
          left = left + vjava.renderContents(item.left[j]);
        }
      }

      var right = "";
      if(!found || selection['right']) {
        for(var j = 0; j < item.right.length; j ++) {
          right = right + vjava.renderContents(item.right[j]);
        }
      }
      return left + '\n' + right;


    } else {
      return item.content;
    }
	}
}
