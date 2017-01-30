getPath = (require './util.coffee').getPath
spawn = (require 'child_process').spawn;

###

###
module.exports =
class CCInterface
	parseVJava: (textContents, onData) ->
		@_run('variational-parser', textContents, (data) ->
			onData(JSON.parse(data.toString()))
		)
		# parser = spawn('variational-parser',[],{ cwd: getPath() });
		# parser.stdout.setEncoding('utf8');
		# parser.stdout.on('data', (data) ->
		# 	onData(JSON.parse(data.toString()));
		# );
		# parser.stdin.write(textContents);
		# parser.stdin.end();

	makeSelection: (projection, onData) ->
		@_run('make-choice', JSON.stringify(projection), (data) ->
			onData(JSON.parse(data.toString()))
		)

	_run: (name, input, onData) ->
		program = spawn(name, [], { cwd: getPath() });
		program.stdout.on('data', onData)
		program.stdin.write(input);
		program.stdin.end();
