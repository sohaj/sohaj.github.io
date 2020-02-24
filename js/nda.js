function passWord() {
var testV = 1;
var pass1 = prompt('Please Enter Password',' ');
while (testV < 3) {
if (pass1.toLowerCase() == "ndasohaj123!") {
window.open('nda.html');
break;
} 
testV+=1;
var pass1 = 
prompt('This Password is Incorrect, Please Try Again.','Password');
}
if (pass1.toLowerCase()!="password" & testV ==3) 
history.go(-1);
return " ";
} 