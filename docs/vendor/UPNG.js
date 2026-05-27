

var UPNG = (function() {
	
	var _bin = {
		nextZero   : function(data,p)  {  while(data[p]!=0) p++;  return p;  },
		readUshort : function(buff,p)  {  return (buff[p]<< 8) | buff[p+1];  },
		writeUshort: function(buff,p,n){  buff[p] = (n>>8)&255;  buff[p+1] = n&255;  },
		readUint   : function(buff,p)  {  return (buff[p]*(256*256*256)) + ((buff[p+1]<<16) | (buff[p+2]<< 8) | buff[p+3]);  },
		writeUint  : function(buff,p,n){  buff[p]=(n>>24)&255;  buff[p+1]=(n>>16)&255;  buff[p+2]=(n>>8)&255;  buff[p+3]=n&255;  },
		readASCII  : function(buff,p,l){  var s = "";  for(var i=0; i<l; i++) s += String.fromCharCode(buff[p+i]);  return s;    },
		writeASCII : function(data,p,s){  for(var i=0; i<s.length; i++) data[p+i] = s.charCodeAt(i);  },
		readBytes  : function(buff,p,l){  var arr = [];   for(var i=0; i<l; i++) arr.push(buff[p+i]);   return arr;  },
		pad : function(n) { return n.length < 2 ? "0" + n : n; },
		readUTF8 : function(buff, p, l) {
			var s = "", ns;
			for(var i=0; i<l; i++) s += "%" + _bin.pad(buff[p+i].toString(16));
			try {  ns = decodeURIComponent(s); }
			catch(e) {  return _bin.readASCII(buff, p, l);  }
			return  ns;
		}
	}

	function toRGBA8(out)
	{
		var w = out.width, h = out.height;
		if(out.tabs.acTL==null) return [decodeImage(out.data, w, h, out).buffer];
		
		var frms = [];
		if(out.frames[0].data==null) out.frames[0].data = out.data;
		
		var len = w*h*4, img = new Uint8Array(len), empty = new Uint8Array(len), prev=new Uint8Array(len);
		for(var i=0; i<out.frames.length; i++)
		{
			var frm = out.frames[i];
			var fx=frm.rect.x, fy=frm.rect.y, fw = frm.rect.width, fh = frm.rect.height;
			var fdata = decodeImage(frm.data, fw,fh, out);
			
			if(i!=0) for(var j=0; j<len; j++) prev[j]=img[j];
			
			if     (frm.blend==0) _copyTile(fdata, fw, fh, img, w, h, fx, fy, 0);
			else if(frm.blend==1) _copyTile(fdata, fw, fh, img, w, h, fx, fy, 1);
			
			frms.push(img.buffer.slice(0));
			
			if     (frm.dispose==0) {}
			else if(frm.dispose==1) _copyTile(empty, fw, fh, img, w, h, fx, fy, 0);
			else if(frm.dispose==2) for(var j=0; j<len; j++) img[j]=prev[j];
		}
		return frms;
	}
	function decodeImage(data, w, h, out)
	{
		var area = w*h, bpp = _getBPP(out);
		var bpl = Math.ceil(w*bpp/8);	// bytes per line

		var bf = new Uint8Array(area*4), bf32 = new Uint32Array(bf.buffer);
		var ctype = out.ctype, depth = out.depth;
		var rs = _bin.readUshort;
		
		var time = Date.now();

		if     (ctype==6) {
			var qarea = area<<2;
			if(depth== 8) for(var i=0; i<qarea;i+=4) {  bf[i] = data[i];  bf[i+1] = data[i+1];  bf[i+2] = data[i+2];  bf[i+3] = data[i+3]; }
			if(depth==16) for(var i=0; i<qarea;i++ ) {  bf[i] = data[i<<1];  }
		}
		else if(ctype==2) {
			var ts=out.tabs["tRNS"];
			if(ts==null) {
				if(depth== 8) for(var i=0; i<area; i++) {  var ti=i*3;  bf32[i] = (255<<24)|(data[ti+2]<<16)|(data[ti+1]<<8)|data[ti];  }
				if(depth==16) for(var i=0; i<area; i++) {  var ti=i*6;  bf32[i] = (255<<24)|(data[ti+4]<<16)|(data[ti+2]<<8)|data[ti];  }
			}
			else {  var tr=ts[0], tg=ts[1], tb=ts[2];
				if(depth== 8) for(var i=0; i<area; i++) {  var qi=i<<2, ti=i*3;  bf32[i] = (255<<24)|(data[ti+2]<<16)|(data[ti+1]<<8)|data[ti];
					if(data[ti]   ==tr && data[ti+1]   ==tg && data[ti+2]   ==tb) bf[qi+3] = 0;  }
				if(depth==16) for(var i=0; i<area; i++) {  var qi=i<<2, ti=i*6;  bf32[i] = (255<<24)|(data[ti+4]<<16)|(data[ti+2]<<8)|data[ti];
					if(rs(data,ti)==tr && rs(data,ti+2)==tg && rs(data,ti+4)==tb) bf[qi+3] = 0;  }
			}
		}
		else if(ctype==3) {
			var p=out.tabs["PLTE"], ap=out.tabs["tRNS"], tl=ap?ap.length:0;
			if(depth==1) for(var y=0; y<h; y++) {  var s0 = y*bpl, t0 = y*w;
				for(var i=0; i<w; i++) { var qi=(t0+i)<<2, j=((data[s0+(i>>3)]>>(7-((i&7)<<0)))& 1), cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
			}
			if(depth==2) for(var y=0; y<h; y++) {  var s0 = y*bpl, t0 = y*w;
				for(var i=0; i<w; i++) { var qi=(t0+i)<<2, j=((data[s0+(i>>2)]>>(6-((i&3)<<1)))& 3), cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
			}
			if(depth==4) for(var y=0; y<h; y++) {  var s0 = y*bpl, t0 = y*w;
				for(var i=0; i<w; i++) { var qi=(t0+i)<<2, j=((data[s0+(i>>1)]>>(4-((i&1)<<2)))&15), cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
			}
			if(depth==8) for(var i=0; i<area; i++ ) {  var qi=i<<2, j=data[i]                      , cj=3*j;  bf[qi]=p[cj];  bf[qi+1]=p[cj+1];  bf[qi+2]=p[cj+2];  bf[qi+3]=(j<tl)?ap[j]:255;  }
		}
		else if(ctype==4) {
			if(depth== 8)  for(var i=0; i<area; i++) {  var qi=i<<2, di=i<<1, gr=data[di];  bf[qi]=gr;  bf[qi+1]=gr;  bf[qi+2]=gr;  bf[qi+3]=data[di+1];  }
			if(depth==16)  for(var i=0; i<area; i++) {  var qi=i<<2, di=i<<2, gr=data[di];  bf[qi]=gr;  bf[qi+1]=gr;  bf[qi+2]=gr;  bf[qi+3]=data[di+2];  }
		}
		else if(ctype==0) {
			var tr = out.tabs["tRNS"] ? out.tabs["tRNS"] : -1;
			for(var y=0; y<h; y++) {
				var off = y*bpl, to = y*w;
				if     (depth== 1) for(var x=0; x<w; x++) {  var gr=255*((data[off+(x>>>3)]>>>(7 -((x&7)   )))& 1), al=(gr==tr*255)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth== 2) for(var x=0; x<w; x++) {  var gr= 85*((data[off+(x>>>2)]>>>(6 -((x&3)<<1)))& 3), al=(gr==tr* 85)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth== 4) for(var x=0; x<w; x++) {  var gr= 17*((data[off+(x>>>1)]>>>(4 -((x&1)<<2)))&15), al=(gr==tr* 17)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth== 8) for(var x=0; x<w; x++) {  var gr=data[off+     x], al=(gr                 ==tr)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
				else if(depth==16) for(var x=0; x<w; x++) {  var gr=data[off+(x<<1)], al=(rs(data,off+(x<<1))==tr)?0:255;  bf32[to+x]=(al<<24)|(gr<<16)|(gr<<8)|gr;  }
			}
		}
		return bf;
	}

	function decode(buff)
	{
		var data = new Uint8Array(buff), offset = 8, bin = _bin, rUs = bin.readUshort, rUi = bin.readUint;
		var out = {tabs:{}, frames:[]};
		var dd = new Uint8Array(data.length), doff = 0;
		var fd, foff = 0;
		var mgck = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
		for(var i=0; i<8; i++) if(data[i]!=mgck[i]) throw "The input is not a PNG file!";
		while(offset<data.length)
		{
			var len  = bin.readUint(data, offset);  offset += 4;
			var type = bin.readASCII(data, offset, 4);  offset += 4;
			if     (type=="IHDR")  {  _IHDR(data, offset, out);  }
			else if(type=="iCCP")  {
				var off = offset;  while(data[off]!=0) off++;
				var fil = data.slice(off+2,offset+len);
				var res = null;
				try { res = _inflate(fil); } catch(e) {  res = inflateRaw(fil);  }
				out.tabs[type] = res;
			}
			else if(type=="CgBI")  {  out.tabs[type] = data.slice(offset,offset+4);  }
			else if(type=="IDAT") {
				for(var j=0; j<len; j++) dd[doff+j] = data[offset+j];
				doff += len;
			}
			else if(type=="acTL")  {
				out.tabs[type] = {  num_frames:rUi(data, offset), num_plays:rUi(data, offset+4)  };
				fd = new Uint8Array(data.length);
			}
			else if(type=="fcTL")  {
				if(foff!=0) {
					var fr0 = out.frames[out.frames.length-1];
					fr0.data = _decompress(out, fd.slice(0,foff), fr0.rect.width, fr0.rect.height);  foff=0;
				}
				var rct = {x:rUi(data, offset+12),y:rUi(data, offset+16),width:rUi(data, offset+4),height:rUi(data, offset+8)};
				var del = rUs(data, offset+22);  del = rUs(data, offset+20) / (del==0?100:del);
				out.frames.push({rect:rct, delay:Math.round(del*1000), dispose:data[offset+24], blend:data[offset+25]});
			}
			else if(type=="fdAT") {
				for(var k=0; k<len-4; k++) fd[foff+k] = data[offset+k+4];
				foff += len-4;
			}
			offset += len;
			offset += 4;
		}
		if(foff!=0) {
			var fr1 = out.frames[out.frames.length-1];
			fr1.data = _decompress(out, fd.slice(0,foff), fr1.rect.width, fr1.rect.height);
		}
		out.data = _decompress(out, dd, out.width, out.height);
		delete out.compress;  delete out.interlace;  delete out.filter;
		return out;
	}

	function _decompress(out, dd, w, h) {
		var bpp = _getBPP(out), bpl = Math.ceil(w*bpp/8), buff = new Uint8Array((bpl+1+out.interlace)*h);
		if(out.tabs["CgBI"]) dd = inflateRaw(dd,buff);
		else dd = _inflate(dd,buff);
		if     (out.interlace==0) dd = _filterZero(dd, out, 0, w, h);
		else if(out.interlace==1) dd = _readInterlace(dd, out);
		return dd;
	}

	function _inflate(data, buff) {  return inflateRaw(new Uint8Array(data.buffer, 2,data.length-6),buff);  }
	var inflateRaw=function(){var D=function(){var o=Uint16Array,j=Uint32Array;return{m:new o(16),v:new o(16),d:[16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15],o:[3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258,999,999,999],z:[0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0,0,0,0],B:new o(32),p:[1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577,65535,65535],w:[0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13,0,0],h:new j(32),g:new o(512),s:[],A:new o(32),t:[],k:new o(32768),c:[],a:[],n:new o(32768),e:[],C:new o(512),b:[],i:new o(1<<15),r:new j(286),f:new j(30),l:new j(19),u:new j(15e3),q:new o(1<<16),j:new o(1<<15)}}();function C(o,j){var I=o.length,A,r,i,y,G,f=D.v;for(var y=0;y<=j;y++)f[y]=0;for(y=1;y<I;y+=2)f[o[y]]++;var a=D.m;A=0;f[0]=0;for(r=1;r<=j;r++){A=A+f[r-1]<<1;a[r]=A}for(i=0;i<I;i+=2){G=o[i+1];if(G!=0){o[i]=a[G];a[G]++}}}function t(o,j,I){var A=o.length,r=D.i;for(var i=0;i<A;i+=2)if(o[i+1]!=0){var y=i>>1,G=o[i+1],f=y<<4|G,a=j-G,k=o[i]<<a,N=k+(1<<a);while(k!=N){var x=r[k]>>>15-j;I[x]=f;k++}}}function g(o,j){var I=D.i,A=15-j;for(var r=0;r<o.length;r+=2){var i=o[r]<<j-o[r+1];o[r]=I[i]>>>A}}(function(){var o=1<<15;for(var j=0;j<o;j++){var I=j;I=(I&2863311530)>>>1|(I&1431655765)<<1;I=(I&3435973836)>>>2|(I&858993459)<<2;I=(I&4042322160)>>>4|(I&252645135)<<4;I=(I&4278255360)>>>8|(I&16711935)<<8;D.i[j]=(I>>>16|I<<16)>>>17}function A(r,i,y){while(i--!=0)r.push(0,y)}for(var j=0;j<32;j++){D.B[j]=D.o[j]<<3|D.z[j];D.h[j]=D.p[j]<<4|D.w[j]}A(D.s,144,8);A(D.s,255-143,9);A(D.s,279-255,7);A(D.s,287-279,8);C(D.s,9);t(D.s,9,D.g);g(D.s,9);A(D.t,32,5);C(D.t,5);t(D.t,5,D.A);g(D.t,5);A(D.b,19,0);A(D.c,286,0);A(D.e,30,0);A(D.a,320,0)}());function F(o,j,I){return(o[j>>>3]|o[(j>>>3)+1]<<8)>>>(j&7)&(1<<I)-1}function s(o,j,I){return(o[j>>>3]|o[(j>>>3)+1]<<8|o[(j>>>3)+2]<<16)>>>(j&7)&(1<<I)-1}function w(o,j){return(o[j>>>3]|o[(j>>>3)+1]<<8|o[(j>>>3)+2]<<16)>>>(j&7)}function b(o,j){return(o[j>>>3]|o[(j>>>3)+1]<<8|o[(j>>>3)+2]<<16|o[(j>>>3)+3]<<24)>>>(j&7)}function v(o,j){var I=Uint8Array,r=0,i=0,y=0,G=0,f=0,a=0,k=0,N=0,x=0,P,J;if(o[0]==3&&o[1]==0)return j?j:new I(0);var A=j==null;if(A)j=new I(o.length>>>2<<3);while(r==0){r=s(o,x,1);i=s(o,x+1,2);x+=3;if(i==0){if((x&7)!=0)x+=8-(x&7);var K=(x>>>3)+4,m=o[K-4]|o[K-3]<<8;if(A)j=H(j,N+m);j.set(new I(o.buffer,o.byteOffset+K,m),N);x=K+m<<3;N+=m;continue}if(A)j=H(j,N+(1<<17));if(i==1){P=D.g;J=D.A;a=(1<<9)-1;k=(1<<5)-1}while(!0){var h=P[w(o,x)&a];x+=h&15;var L=h>>>4;if(L>>>8==0){j[N++]=L}else if(L==256){break}else{var M=N+L-254;var e=J[w(o,x)&k];x+=e&15;var E=e>>>4,c=D.h[E],q=(c>>>4)+s(o,x,c&15);x+=c&15;if(A)j=H(j,N+(1<<17));while(N<M){j[N]=j[N++-q];j[N]=j[N++-q];j[N]=j[N++-q];j[N]=j[N++-q]}N=M}}}return j.length==N?j:j.slice(0,N)}function H(o,j){if(j<=o.length)return o;var A=new Uint8Array(Math.max(o.length<<1,j));A.set(o,0);return A}return v}();
	function _readInterlace(data, out){ var w = out.width, h = out.height; var bpp = _getBPP(out), cbpp = bpp>>3, bpl = Math.ceil(w*bpp/8); var img = new Uint8Array( h * bpl ); var di = 0; var starting_row=[0,0,4,0,2,0,1], starting_col=[0,4,0,2,0,1,0], row_increment=[8,8,8,4,4,2,2], col_increment=[8,8,4,4,2,2,1], pass=0; while(pass<7){ var ri=row_increment[pass], ci=col_increment[pass], sw=0, sh=0; var cr=starting_row[pass]; while(cr<h){cr+=ri;sh++;} var cc=starting_col[pass]; while(cc<w){cc+=ci;sw++;} var bpll=Math.ceil(sw*bpp/8); _filterZero(data,out,di,sw,sh); var y=0,row=starting_row[pass]; while(row<h){ var col=starting_col[pass], cdi=(di+y*bpll)<<3; while(col<w){ if(bpp>=8){ var ii=row*bpl+col*cbpp; for(var n=0;n<cbpp;n++) img[ii+n]=data[(cdi>>3)+n]; } cdi+=bpp; col+=ci; } y++; row+=ri; } if(sw*sh!=0) di+=sh*(1+bpll); pass=pass+1; } return img; }
	function _getBPP(out) { var noc = [1,null,3,1,2,null,4][out.ctype]; return noc * out.depth; }
	function _filterZero(data, out, off, w, h){ var bpp=_getBPP(out), bpl=Math.ceil(w*bpp/8); bpp=Math.ceil(bpp/8); var i,di,type=data[off],x=0; if(type>1) data[off]=[0,0,1][type-2]; if(type==3) for(x=bpp; x<bpl; x++) data[x+1]=(data[x+1]+(data[x+1-bpp]>>>1))&255; for(var y=0;y<h;y++){ i=off+y*bpl; di=i+y+1; type=data[di-1]; x=0; if(type==0) for(;x<bpl;x++) data[i+x]=data[di+x]; else if(type==1){ for(;x<bpp;x++) data[i+x]=data[di+x]; for(;x<bpl;x++) data[i+x]=(data[di+x]+data[i+x-bpp]); } else if(type==2){ for(;x<bpl;x++) data[i+x]=(data[di+x]+data[i+x-bpl]); } else { for(;x<bpl;x++) data[i+x]=data[di+x]; } } return data; }
	function _paeth(a,b,c){ var p=a+b-c, pa=(p-a), pb=(p-b), pc=(p-c); if(pa*pa<=pb*pb&&pa*pa<=pc*pc) return a; else if(pb*pb<=pc*pc) return b; return c; }
	function _IHDR(data, offset, out){ out.width=_bin.readUint(data, offset); offset+=4; out.height=_bin.readUint(data, offset); offset+=4; out.depth=data[offset]; offset++; out.ctype=data[offset]; offset++; out.compress=data[offset]; offset++; out.filter=data[offset]; offset++; out.interlace=data[offset]; offset++; }
	function _copyTile(sb, sw, sh, tb, tw, th, xoff, yoff, mode){ var w=Math.min(sw,tw), h=Math.min(sh,th); var si=0, ti=0; for(var y=0;y<h;y++) for(var x=0;x<w;x++){ if(xoff>=0&&yoff>=0){ si=(y*sw+x)<<2; ti=((yoff+y)*tw+xoff+x)<<2; } else { si=((-yoff+y)*sw-xoff+x)<<2; ti=(y*tw+x)<<2; } if(mode==0){ tb[ti]=sb[si]; tb[ti+1]=sb[si+1]; tb[ti+2]=sb[si+2]; tb[ti+3]=sb[si+3]; } else if(mode==1){ var fa=sb[si+3]*(1/255), fr=sb[si]*fa, fg=sb[si+1]*fa, fb=sb[si+2]*fa; var ba=tb[ti+3]*(1/255), br=tb[ti]*ba, bg=tb[ti+1]*ba, bb=tb[ti+2]*ba; var ifa=1-fa, oa=fa+ba*ifa, ioa=(oa==0?0:1/oa); tb[ti+3]=255*oa; tb[ti]= (fr+br*ifa)*ioa; tb[ti+1]=(fg+bg*ifa)*ioa; tb[ti+2]=(fb+bb*ifa)*ioa; } else if(mode==2){ var fa2=sb[si+3], fr2=sb[si], fg2=sb[si+1], fb2=sb[si+2]; var ba2=tb[ti+3], br2=tb[ti], bg2=tb[ti+1], bb2=tb[ti+2]; if(fa2==ba2 && fr2==br2 && fg2==bg2 && fb2==bb2){ tb[ti]=0; tb[ti+1]=0; tb[ti+2]=0; tb[ti+3]=0; } else { tb[ti]=fr2; tb[ti+1]=fg2; tb[ti+2]=fb2; tb[ti+3]=fa2; } } else if(mode==3){ var fa3=sb[si+3], fr3=sb[si], fg3=sb[si+1], fb3=sb[si+2]; var ba3=tb[ti+3], br3=tb[ti], bg3=tb[ti+1], bb3=tb[ti+2]; if(fa3==ba3 && fr3==br3 && fg3==bg3 && fb3==bb3) continue; if(fa3<220 && ba3>20) return false; } } return true; }
	return { decode:decode, toRGBA8:toRGBA8, _paeth:_paeth, _copyTile:_copyTile, _bin:_bin, encode:function(){}, encodeLL:function(){}, quantize:function(){} };
})();
