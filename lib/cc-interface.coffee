getPath = (require './util.coffee').getPath
spawn = (require 'child_process').spawn;

###

###
module.exports =
class CCInterface
	parseVJava: (textContents, onData) ->
		parser = spawn('variational-parser',[],{ cwd: getPath() });
		parser.stdout.setEncoding('utf8');
		parser.stdout.on('data', (data) ->
			onData(JSON.parse(data.toString()));
		);
		parser.stdin.write(textContents);
		parser.stdin.end();
