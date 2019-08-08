var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var Victor = require('victor');
var fs = require('fs');

var entities = [];
var settings;
var connections = 0;

//networking

//helpers
function sendData(){
    for(var i = 0; i<entities.length; i++){
	if(entities[i].type==="player"){
	    io.to(entities[i].id).volatile.emit("new_data", JSON.stringify(prepareData(entities[i].id)));
	}
    }
}
function prepareData(playerId){
    var newEntities = [];
    var player;
    
    for(var i = 0; i<entities.length; i++){
	if(entities[i].type==="player"){
	    if(entities[i].id===playerId){
		player = entities[i];
	    }
	}
    }
    
    for(var i = 0; i<entities.length; i++){
	if(isOnScreen(entities[i].posX, entities[i].posY, entities[i].size, player)){
	    newEntities[newEntities.length] = entities[i];
	}
    }
    return newEntities;
}
function addPlayer(playerId){
    var size = measurePlayers().smallest;
    if(size<settings.startingSize){
	size = settings.startingSize;
    }
    entities[entities.length] = {
	type:"player",
	name:"default name",
	id:playerId,
	size:size,
	posX:randInt(-settings.mapSize, settings.mapSize),
	posY:randInt(-settings.mapSize, settings.mapSize),
	vel:new Victor(0, 0),
	dec:settings.playerDec,
	acc:settings.playerAcc,
	digesting:0,
	canvasWidth:0,
	canvasHeight:0,
	apparentSize:0
    };
}
function measurePlayers(){
    var smallest = 0;
    var biggest = 0;
    for(var i = 0; i<entities.length; i++){
	if(entities[i].type==="player"){
	    if(entities[i].size<smallest || smallest<=0){
		smallest = entities[i].size;
	    }
	    if(entities[i].size>biggest){
		biggest = entities[i].size;
	    }
	}
    }
    return {smallest:smallest, biggest:biggest};
}
function digest(){
    for(var i = 0; i<entities.length; i++){
	if(entities[i].digesting>=settings.digestionRate){
	    entities[i].digesting-=settings.digestionRate;
	    entities[i].size+=settings.digestionRate;
	}
	else if(entities[i].digesting>0){
	    entities[i].size+=entities[i].digesting;
	    entities[i].digesting = 0;
	}
    }
}
function spawnFodder(){
    //count clusters and fodder
    var clusterAmount = 0;
    var fodderAmount = 0;
    for(var i = 0; i<entities.length; i++){
	if(entities[i].type==="cluster"){
	    clusterAmount++;
	    fodderAmount+=entities[i].inside.length;
	}
    }
    
    
    //find player sizes
    var measures = measurePlayers();
    
    //despawn fodder
    for(var i = 0; i<entities.length; i++){
	if(entities[i].type==="cluster"){
	    for(var ii = 0; ii<entities[i].inside.length; ii++){
		if(entities[i].inside[ii].size<measures.smallest*settings.fodderSize/4){
		    entities[i].inside.splice(ii, 1);
		}
	    }
	    if(entities[i].length<=0){
		entities.splice(i, 1);
	    }
	}
    }
    
    //spawn clusters
    while(clusterAmount<settings.maxClusters){
	var size = randInt(measures.smallest*10, measures.biggest*10);
	var posX = randInt(-settings.mapSize+size/2, settings.mapSize-size/2);
	var posY = randInt(-settings.mapSize+size/2, settings.mapSize-size/2);
	entities[entities.length] = {type:"cluster", inside:[], posX:posX, posY:posY, size:settings.clusterSize, vel:new Victor(0, 0), dec:0, acc:0, digesting:0};
	clusterAmount++;
    }
    
    //check for fodder overflow
    if(fodderAmount>=settings.maxFodder){
	return;
    }
    
    
    //spawn fodder
    var toSpawn = settings.fodderSpawnRate;
    var spawned = 0;
    if(toSpawn+fodderAmount>settings.maxFodder){
	toSpawn = settings.maxFodder-fodderAmount;
    }
    for(var i = 0; i<entities.length; i++){
	if(entities[i].type==="cluster"){
	    while(entities[i].inside.length<settings.clusterVolume){
		
		var size = measures.smallest*settings.fodderSize;
		var posX = posY = 0;
		do{
		    posX = entities[i].posX+randInt(-entities[i].size/2+size/2, entities[i].size/2-size/2);
		    posY = entities[i].posY+randInt(-entities[i].size/2+size/2, entities[i].size/2-size/2);
		}while(Math.sqrt(Math.pow(posX-entities[i].posX, 2)+Math.pow(posY-entities[i].posY, 2))>=entities[i].size/2-size/2);
		
		entities[i].inside[entities[i].inside.length] = {type:"fodder", size:size, posX:posX, posY:posY};
		spawned++;
		if(spawned>=toSpawn){
		    return;
		}
	    }
	}
    }
}
function processKeyInput(data, id){
    if(data){
	var pIndex = 0;
	for(var i = 0; i<entities.length; i++){
	    if(entities[i].type==="player"){
		if(entities[i].id===id){
		    pIndex = i;
		}
	    }
	}

	//accelerate
	if(data.dirX!==0 && data.dirY!==0){
	    if(data.dirX>0 && data.dirY>0){
		accelerateEntity(2, 0.5, pIndex);
		accelerateEntity(3, 0.5, pIndex);
	    }
	    else if(data.dirX>0 && data.dirY<0){
		accelerateEntity(2, 0.5, pIndex);
		accelerateEntity(1, 0.5, pIndex);
	    }
	    else if(data.dirX<0 && data.dirY>0){
		accelerateEntity(4, 0.5, pIndex);
		accelerateEntity(3, 0.5, pIndex);
	    }
	    else{
		accelerateEntity(4, 0.5, pIndex);
		accelerateEntity(1, 0.5, pIndex);
	    }
	}
	else{
	    if(data.dirY<0){
		accelerateEntity(1, 1, pIndex);
	    }
	    else if(data.dirY>0){
		accelerateEntity(3, 1, pIndex);
	    }
	    else if(data.dirX<0){
		accelerateEntity(4, 1, pIndex);
	    }
	    else if(data.dirX>0){
		accelerateEntity(2, 1, pIndex);
	    }
	}
    }
}
function accelerateEntity(direction, accMod, index){
    var accVec = 0;
    switch(direction){
	case 1:
	    accVec = new Victor(0, accMod*entities[index].acc);
	    break;
	case 2:
	    accVec = new Victor(accMod*entities[index].acc, 0);
	    break;
	case 3:
	    accVec = new Victor(0, -accMod*entities[index].acc);
	    break;
	case 4:
	    accVec = new Victor(-accMod*entities[index].acc, 0);
	    break;
    }
    
    entities[index].vel.add(accVec);
}
function moveEntities(){
    for(var i = 0; i<entities.length; i++){
	//decelerate
	var resVec = new Victor(entities[i].vel.x, entities[i].vel.y);
	resVec.x*=entities[i].dec;
	resVec.y*=entities[i].dec;

	if(resVec.length()<entities[i].acc/100){
	    entities[i].vel = new Victor(0, 0);
	}
	else{
	    entities[i].vel.subtract(resVec);
	}
	
	//move
	entities[i].posX+=entities[i].vel.x;
	entities[i].posY-=entities[i].vel.y;
    }
}
function randInt(max, min){
    return Math.floor(Math.random() * (max - min) ) + min;
}
function checkCollisions(){
    for(var o = 0; o<entities.length; o++){
	if(entities[o].type==="player"){
	    for(var i = 0; i<entities.length; i++){
		if(i!==o){
		    if(entities[i].type==="cluster"){
			//check collision with cluster
			var distance = Math.sqrt( Math.pow(entities[o].posX-entities[i].posX, 2) + Math.pow(entities[o].posY-entities[i].posY, 2) );
			var hitDistance = entities[o].size/2+entities[i].size/2;
			if(hitDistance>=distance){
			    for(var ii = 0; ii<entities[i].inside.length; ii++){
				//check collision with cluster insides
				distance = Math.sqrt( Math.pow(entities[o].posX-entities[i].inside[ii].posX, 2) + Math.pow(entities[o].posY-entities[i].inside[ii].posY, 2) );
				hitDistance = entities[o].size/2+entities[i].inside[ii].size/2;
				if(hitDistance>=distance){
				    //collide
				    if(entities[o].size>entities[i].inside[ii].size*settings.consumeTreshold){
					if(entities[o].type!=="fodder"){
					    entities[o].digesting+=entities[i].inside[ii].size*(entities[i].inside[ii].size/entities[o].size);
					    entities[i].inside.splice(ii, 1);
					}
				    }
				    else if(entities[i].inside[ii].size>entities[o].size*settings.consumeTreshold){
					if(entities[i].inside[ii].type!=="fodder"){
					    entities[i].inside[ii].digesting+=entities[o].size*(entities[o].size/entities[i].inside[ii].size);
					    entities.splice(o, 1);
					}
				    }
				}
			    }
			}
		    }
		}
	    }
	}
    }
}
function isOnScreen(x, y, size, player){
    var relSize = size/player.size*player.apparentSize;
    var scale = player.apparentSize/player.size;
    var relX = player.canvasWidth/2-(player.posX-x)*scale;
    var relY = player.canvasHeight/2-(player.posY-y)*scale;

    if(0-relSize/2<relX && relX<player.canvasWidth+relSize/2 && 0-relSize/2<relY && relY<player.canvasHeight+relSize/2){
	return true;
    }
    return false;
}

//essentials
function tick(){
    sendData();
    refresh();
}
function init(){
    //load settings
    settings = JSON.parse(fs.readFileSync("settings.json"));
    console.log("Settings loaded:");
    console.log(settings);
    
    //setup networking
    io.on("connection", function(socket){
	connections++;
	console.log("Connected: "+socket.id.toString());
	addPlayer(socket.id.toString());
	socket.on("disconnect", function(){
	    connections--;
	    console.log("Disconnected "+socket.id.toString());
	    for(var i = 0; i<entities.length; i++){
		if(entities[i].type==="player"){
		    if(entities[i].id===socket.id.toString()){
			entities[i].name = "Abandoned";
		    }
		}
	    }
	});
	socket.on("playerAction", function(playerAction){
	    processKeyInput(JSON.parse(playerAction), socket.id.toString());
	});
	socket.on("name", function(newName){
	    for(var i = 0; i<entities.length; i++){
		if(entities[i].type==="player"){
		    if(entities[i].id===socket.id.toString()){
			entities[i].name = newName;
		    }
		}
	    }
	});
	socket.on("resize", function(data){
	    var parsedData = JSON.parse(data);
	    for(var i = 0; i<entities.length; i++){
		if(entities[i].type==="player"){
		    if(entities[i].id===socket.id.toString()){
			entities[i].canvasWidth = parsedData.canvasWidth;
			entities[i].canvasHeight = parsedData.canvasHeight;
			entities[i].apparentSize = parsedData.apparentSize;
		    }
		}
	    }
	});
    });
    http.listen(settings.port, function(){
	console.log('Listening on:' + settings.port);
    });

}
function refresh(){
    if(entities.length>0){
	digest();
	moveEntities();
	spawnFodder();
	checkCollisions();
    }
}

init();
setInterval(tick, settings.tickSpan);