



parseContents(item) {
  if(item.type == "dimension") {
    vjava.dimensions.push(item);
    return vjava.parseDimension(item);
  } else {
    return vjava.parseJava(item);
  }
},

displayDimensions(dimensions, editor) {
  for(i = 0; i < vjava.dimensions.length; i ++) {
    var dimension = dimensions[i];
    var dimDiv = $(`<hr><div class='form-group'><h2>${dimension.id}</h2>
      <input type='radio' name='${dimension.id}' value='left'>Left</input><br>
      <input type='radio' name='${dimension.id}' value='right'>Right</input><br>
      <input type='radio' name='${dimension.id}' value='unselected' checked>No Selection</input></div></div>`);
    vjava.ui.append(dimDiv);
    //create a marker in the ui to apply styles, etc.
    dimension.leftmarker = editor.markBufferRange([dimension.leftstart,dimension.leftend]);
    dimension.rightmarker = editor.markBufferRange([dimension.rightstart, dimension.rightend]);
    //if this dimension doesn't already have a color associated with it, then give it one
    if(!dimension.color) {
      dimension.color = "#ff3399"; //TODO: randomize or perhaps allow user to select this
    }
    var leftCssClass = 'dimension-marker-' + dimension.id + "-left";
    var rightCssClass = 'dimension-marker-' + dimension.id + "-right";
    editor.decorateMarker(dimension.marker, {type: 'line', class: cssclass});
    $('head').append("<style>atom-text-editor::shadow ." + cssclass + " { background-color: " + dimension.color + "; } </style>")
    //$("atom-text-editor::shadow ." + cssclass).css("background-color",dimension.color);
  }

},

parseVJava(textContents) {
  //send file contents to the backend, receive jsonified output
  var packagePath = atom.packages.resolvePackagePath("variational-java") + "/lib";
  exec('cd ' + packagePath);

  var spawn = require('child_process').spawn;
  var parser = spawn('main',[],{ cwd: packagePath });

  parser.stdout.setEncoding('utf8');
  parser.stdout.on('data', function (data) {
    vjava.projection = JSON.parse(data.toString());

    var finalContents = [];
    for(i = 0; i < vjava.projection.length; i ++) {
      item = vjava.projection[i];
      finalContents.push(vjava.parseContents(item));
    }
    finalContents = finalContents.join("\n");
    var activeEditor = atom.workspace.getActiveTextEditor();

    activeEditor.setText(finalContents);
    vjava.displayDimensions(vjava.dimensions, activeEditor);
  });
  parser.on('exit', function (code) {
    console.log('child process exited with code ' + code);
  });

  //\x04 is the end of file character? o.O
  parser.stdin.write(textContents);
  parser.stdin.end();


  // exec(cmdStr, function(error, stdout, stderr)  // I don't want vjava to be async :(
  return
},

notifyUser(message) {
  //print the message to our ui in the top right
  vjava.message.text(message);
},

parseDimension(dim) {
  //accept a jsonified dimension, and return whatever we want that to look like in the editor
  var left = "";
  for(var i = 0; i < dim.left.length; i ++) left = left + vjava.parseContents(dim.left[i]);
  var right = "";
  for(var i = 0; i < dim.left.length; i ++) right = right + vjava.parseContents(dim.right[i]);
  return left + '\n' + right;
},

parseJava(java) {
  //accept a jsonified java fragment, and return whatever we want that to look like in the editor
  return java.content;
},

createUI() {
  var uiElement = $("<div id='variationalJavaUI'><h1>Variation Viewer</h1><br><div id='message'></div></div>");
  atom.workspace.addRightPanel({item: uiElement});
  vjava.ui = $("#variationalJavaUI");
  vjava.message = vjava.ui.find("#message");
},
